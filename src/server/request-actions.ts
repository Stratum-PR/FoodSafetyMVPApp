"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isAppError } from "@/domain/errors";
import type { NewRequestError, NewRequestField } from "@/domain/requests";
import type { UploadError, UploadField } from "@/domain/upload";

import { getRequestContext } from "./context";
import { markNotificationsRead } from "./notifications";
import { portalUpload } from "./portal";
import { cancelRequest, createRequest, regenerateLink, sendRequest, waiveItem } from "./requests";

/*
 * Form actions for requests, the supplier link and the notification bell. Expected problems come
 * back as codes the forms show next to the field; anything else goes to the error page.
 */

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

/** This app's own address, for links in emails (the request's Host, as the browser sent it). */
async function origin(): Promise<string> {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

type Failure = { status: "error"; code: "no_permission" | "not_found" | "conflict" };
function failure(error: unknown): Failure {
  if (!isAppError(error)) throw error;
  return {
    status: "error",
    code: error.code === "forbidden" ? "no_permission" : error.code === "conflict" ? "conflict" : "not_found",
  };
}

/* New request */

export type NewRequestState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<NewRequestField | "partyId", NewRequestError>> }
  | Failure;

export async function createRequestAction(
  company: string,
  _previous: NewRequestState,
  form: FormData,
): Promise<NewRequestState> {
  let id: string;
  let link: string | undefined;
  try {
    const ctx = await getRequestContext(company);
    const outcome = await createRequest(
      ctx,
      {
        partyId: text(form, "partyId"),
        contactId: text(form, "contactId"),
        requirementKeys: form.getAll("key").filter((k): k is string => typeof k === "string"),
        dueOn: text(form, "dueOn"),
        language: text(form, "language"),
        message: text(form, "message"),
        send: text(form, "intent") === "send",
      },
      await origin(),
    );
    if (!outcome.ok) return { status: "invalid", errors: outcome.errors };
    ({ id, link } = outcome);
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/${company}`, "layout");
  // The link is shown once, on the request page right after sending (it's never stored).
  redirect(`/${company}/solicitudes/${encodeURIComponent(id)}${link ? `#enlace=${encodeURIComponent(link)}` : ""}`);
}

/* Request page actions */

export type RequestActionState =
  | { status: "idle" }
  | { status: "done"; link?: string }
  | { status: "invalid"; error: "reason_required" | "reason_too_long" | "closed" }
  | Failure;

async function run(
  company: string,
  fn: (ctx: Awaited<ReturnType<typeof getRequestContext>>) => Promise<RequestActionState>,
): Promise<RequestActionState> {
  try {
    const result = await fn(await getRequestContext(company));
    revalidatePath(`/${company}`, "layout");
    return result;
  } catch (error) {
    return failure(error);
  }
}

export async function sendRequestAction(company: string, id: string): Promise<RequestActionState> {
  return run(company, async (ctx) => ({ status: "done", link: (await sendRequest(ctx, id, await origin())).link }));
}

export async function newLinkAction(company: string, id: string): Promise<RequestActionState> {
  return run(company, async (ctx) => ({ status: "done", link: (await regenerateLink(ctx, id, await origin())).link }));
}

export async function cancelRequestAction(
  company: string,
  id: string,
  _previous: RequestActionState,
  form: FormData,
): Promise<RequestActionState> {
  return run(company, async (ctx) => {
    const r = await cancelRequest(ctx, id, text(form, "reason"));
    return r.ok ? { status: "done" } : { status: "invalid", error: r.error };
  });
}

export async function waiveItemAction(
  company: string,
  id: string,
  itemId: string,
  _previous: RequestActionState,
  form: FormData,
): Promise<RequestActionState> {
  return run(company, async (ctx) => {
    const r = await waiveItem(ctx, id, itemId, text(form, "reason"));
    return r.ok ? { status: "done" } : { status: "invalid", error: r.error };
  });
}

/* Supplier link (no account: the secret in the URL is the only credential) */

export type PortalUploadState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "invalid"; errors: Partial<Record<UploadField, UploadError>> }
  | { status: "denied"; denial: string };

export async function portalUploadAction(
  secret: string,
  itemId: string,
  _previous: PortalUploadState,
  form: FormData,
): Promise<PortalUploadState> {
  const file = form.get("file");
  const outcome = await portalUpload(secret, {
    itemId,
    typeCode: text(form, "typeCode"),
    issuedOn: text(form, "issuedOn"),
    expiresOn: text(form, "expiresOn"),
    file: file instanceof File ? file : null,
  });
  if (outcome.ok) {
    revalidatePath(`/portal/${secret}`);
    return { status: "done" };
  }
  return "errors" in outcome ? { status: "invalid", errors: outcome.errors } : { status: "denied", denial: outcome.denial };
}

/* Bell */

export async function markNotificationsReadAction(company: string): Promise<void> {
  const ctx = await getRequestContext(company);
  await markNotificationsRead(ctx);
  revalidatePath(`/${company}`, "layout");
}
