"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAppError } from "@/domain/errors";
import type { VerificationError, VerificationField, VerificationInput } from "@/domain/evidence";
import type { ReviewDenial } from "@/domain/review";
import type { UploadError, UploadField } from "@/domain/upload";

import { getRequestContext } from "./context";
import { decideDocument, uploadDocument } from "./documents";

export type UploadFormState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<UploadField, UploadError>> }
  | { status: "error"; code: "no_permission" | "not_found" };

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

/**
 * The upload form. On success it opens the new document's page; on invalid input it returns
 * the problem with each field so the form can show it next to that field.
 */
export async function uploadDocumentAction(
  company: string,
  _previous: UploadFormState,
  form: FormData,
): Promise<UploadFormState> {
  const file = form.get("file");
  let id: string;
  try {
    const ctx = await getRequestContext(company);
    const outcome = await uploadDocument(ctx, {
      partyId: text(form, "partyId"),
      about: text(form, "about"),
      typeCode: text(form, "typeCode"),
      lotCode: text(form, "lotCode"),
      issuedOn: text(form, "issuedOn"),
      expiresOn: text(form, "expiresOn"),
      file: file instanceof File ? file : null,
    });
    if (!outcome.ok) return { status: "invalid", errors: outcome.errors };
    id = outcome.id;
  } catch (error) {
    if (isAppError(error)) {
      return { status: "error", code: error.code === "forbidden" ? "no_permission" : "not_found" };
    }
    throw error;
  }
  revalidatePath(`/${company}`, "layout");
  // redirect() works by throwing, so it stays outside the try/catch.
  redirect(`/${company}/documentos/${encodeURIComponent(id)}`);
}

export type ReviewFormState =
  | { status: "idle" }
  | { status: "done"; decision: "accept" | "reject"; superseded: number }
  | {
      status: "error";
      code: ReviewDenial | "not_found" | "invalid";
      errors?: Partial<Record<VerificationField, VerificationError>>;
    };

/**
 * The Aceptar / Rechazar form. company and documentId are bound on the server page; the
 * decision comes from the button pressed. Expected failures come back as a code the form
 * shows as a message; anything else goes to the error page with a reference.
 */
export async function reviewDocumentAction(
  company: string,
  documentId: string,
  _previous: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const decision = form.get("decision");
  const reason = form.get("reason");
  if ((decision !== "accept" && decision !== "reject") || (reason !== null && typeof reason !== "string")) {
    return { status: "error", code: "invalid" };
  }

  try {
    const ctx = await getRequestContext(company);
    const verification: VerificationInput = {
      checklist: form.getAll("checklist").filter((v): v is string => typeof v === "string"),
      scheme: text(form, "scheme"),
      scope: text(form, "scope"),
      issuingBody: text(form, "issuingBody"),
      certificateNumber: text(form, "certificateNumber"),
      facility: text(form, "facility"),
      auditDate: text(form, "auditDate"),
      directoryVerified: form.get("directoryVerified") === "on",
      insurer: text(form, "insurer"),
      policyNumber: text(form, "policyNumber"),
      coverageUsd: text(form, "coverageUsd"),
    };
    const outcome = await decideDocument(ctx, documentId, decision, reason ?? "", verification);
    if (!outcome.ok) return { status: "error", code: outcome.denial, errors: outcome.errors };
    // Compliance, the panel and the supplier pages all change with a decision.
    revalidatePath(`/${company}`, "layout");
    return { status: "done", decision, superseded: outcome.superseded };
  } catch (error) {
    if (isAppError(error)) {
      return { status: "error", code: error.code === "forbidden" ? "no_permission" : "not_found" };
    }
    throw error;
  }
}
