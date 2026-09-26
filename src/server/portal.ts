import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import { todayIn } from "@/domain/dates";
import { checkPortalToken, type PortalDenial } from "@/domain/portal";
import type { ProgramCode, RequirementCode } from "@/domain/programs";
import { itemUploaded, type RequestItemStatus } from "@/domain/requests";
import type { MaterialKind, SupplierDocument } from "@/domain/suppliers";
import { checkUpload, MAX_FILE_BYTES, safeFileName, type UploadError, type UploadField } from "@/domain/upload";
import { timeZone } from "@/i18n/config";

import { getCompany } from "./companies";
import { fileStore } from "./files/store";
import { describeSubject, hashToken, type SubjectLabel } from "./requests";
import { getSampleStore } from "./sample/store";
import { findTokenByHash } from "./sample/workflow-store";

/*
 * The supplier's request link (no account). Everything starts from the secret in the URL: its
 * hash finds exactly one request, and the page shows only that request's items, the requesting
 * company's name and the supplier's own name. Nothing about other requests, suppliers or
 * documents is ever read into the page. Uploads go to review like any other document; they
 * never count until a reviewer accepts them.
 */

export type PortalView = {
  companyName: string;
  partyName: string;
  contactName: string;
  language: "es" | "en";
  dueOn: string;
  message?: string;
  expiresOn: string;
  items: {
    id: string;
    code: RequirementCode;
    program: ProgramCode;
    subject: Omit<SubjectLabel, "partyId">;
    /** Document types that satisfy it, as catalog codes. */
    types: string[];
    status: RequestItemStatus;
    rejectionReason?: string;
  }[];
};

export type PortalLookup = { ok: true; view: PortalView } | { ok: false; denial: PortalDenial | "not_found" };

type Resolved = NonNullable<ReturnType<typeof resolve>>;

function resolve(secret: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(secret)) return null;
  const found = findTokenByHash(hashToken(secret));
  if (!found) return null;
  const request = found.store.requests.find((r) => r.id === found.token.requestId);
  return request ? { ...found, request } : null;
}

async function open(
  secret: string,
): Promise<{ ok: true; r: Resolved; today: string } | { ok: false; denial: PortalDenial | "not_found" }> {
  const r = resolve(secret);
  if (!r) return { ok: false, denial: "not_found" };
  const today = todayIn(timeZone);
  const denial = checkPortalToken(r.token, r.request, today);
  return denial ? { ok: false, denial } : { ok: true, r, today };
}

/** The request behind a link. Records that the link was used (an observable open). */
export async function openPortal(secret: string): Promise<PortalLookup> {
  const opened = await open(secret);
  if (!opened.ok) return opened;
  const { r, today } = opened;
  const company = await getCompany(r.token.companySlug);
  if (!company) return { ok: false, denial: "not_found" };
  const store = getSampleStore(company.slug, today);
  const contact = store.contacts.find((c) => c.id === r.request.contactId);

  const now = new Date().toISOString();
  // One "opened" entry per day and link is enough for the record.
  if (!r.token.lastUsedAt || r.token.lastUsedAt.slice(0, 10) !== now.slice(0, 10)) {
    store.events.push({
      id: randomUUID(),
      at: now,
      actorId: `portal:${r.request.contactId}`,
      action: "portal.opened",
      partyId: r.request.partyId,
      requestId: r.request.id,
    });
    r.request.lastActivityAt = now;
  }
  r.token.lastUsedAt = now;

  return {
    ok: true,
    view: {
      companyName: company.name,
      partyName: store.parties.find((p) => p.id === r.request.partyId)?.name ?? "",
      contactName: contact?.name ?? "",
      language: r.request.language,
      dueOn: r.request.dueOn,
      message: r.request.message,
      expiresOn: r.token.expiresOn,
      items: r.request.items
        // Waived items were taken off the request; the supplier doesn't need to see them.
        .filter((i) => i.status !== "waived")
        .map((i) => {
          const { partyId: _omit, ...subject } = describeSubject(store, i.subject);
          void _omit;
          return {
            id: i.id,
            code: i.code,
            program: i.program,
            subject,
            types: [...i.anyOf],
            status: i.status,
            rejectionReason: i.status === "rejected" ? i.rejectionReason : undefined,
          };
        }),
    },
  };
}

export type PortalUploadInput = {
  itemId: string;
  typeCode: string;
  issuedOn: string;
  expiresOn: string;
  file: File | null;
};

export type PortalUploadOutcome =
  | { ok: true }
  | { ok: false; denial: PortalDenial | "not_found" | "not_waiting" }
  | { ok: false; errors: Partial<Record<UploadField, UploadError>> };

/** The supplier sends a document for one item. It goes to the company's review queue. */
export async function portalUpload(secret: string, input: PortalUploadInput): Promise<PortalUploadOutcome> {
  const opened = await open(secret);
  if (!opened.ok) return opened;
  const { r, today } = opened;
  const store = getSampleStore(r.token.companySlug, today);
  const index = r.request.items.findIndex((i) => i.id === input.itemId);
  if (index < 0) return { ok: false, denial: "not_found" };
  const item = r.request.items[index];

  let materialKind: MaterialKind | null = null;
  if (item.subject.kind === "source") {
    const sourceId = item.subject.sourceId;
    const source = store.sources.find((s) => s.id === sourceId);
    materialKind = store.materials.find((m) => m.id === source?.materialId)?.kind ?? null;
  }
  // Only the document types the item asks for.
  const typeCode = item.anyOf.includes(input.typeCode) ? input.typeCode : "";

  const file = input.file && input.file.size > 0 ? input.file : null;
  const data = file && file.size <= MAX_FILE_BYTES ? new Uint8Array(await file.arrayBuffer()) : null;
  const check = checkUpload(
    {
      subject: item.subject,
      materialKind,
      typeCode,
      lotCode: "",
      issuedOn: input.issuedOn,
      expiresOn: input.expiresOn,
      file: input.file ? { size: input.file.size, head: data?.subarray(0, 16) ?? new Uint8Array() } : null,
    },
    DEFAULT_CATALOG,
    today,
  );
  if (!check.ok) return check;

  const id = `up-${randomUUID()}`;
  const at = new Date().toISOString();
  const next = itemUploaded(r.request, item, id, at);
  if (typeof next === "string") return { ok: false, denial: "not_waiting" };

  const name = safeFileName(file!.name, check.fileType);
  const key = `${r.token.companySlug}/${id}/${name}`;
  await fileStore().put(key, data!);
  const doc: SupplierDocument = {
    id,
    typeCode,
    subject: item.subject,
    state: "pending_review",
    receivedOn: today,
    issuedOn: check.issuedOn,
    expiresOn: check.expiresOn,
    uploadedBy: `portal:${r.request.contactId}`,
    receivedVia: "portal",
    requestItemId: item.id,
    file: {
      key,
      name,
      size: data!.byteLength,
      contentType: check.fileType,
      sha256: createHash("sha256").update(data!).digest("hex"),
    },
  };
  store.documents = [...store.documents, doc];
  r.request.items[index] = next;
  r.request.lastActivityAt = at;
  store.events.push({
    id: randomUUID(),
    at,
    actorId: `portal:${r.request.contactId}`,
    action: "portal.uploaded",
    partyId: r.request.partyId,
    requestId: r.request.id,
    documentId: id,
    detail: findType(DEFAULT_CATALOG, typeCode)?.code,
  });
  // Tell whoever made the request that something arrived for review.
  r.store.notifications.push({
    id: randomUUID(),
    userId: r.request.createdBy,
    kind: "portal_upload",
    record: { kind: "document", id },
    createdAt: at,
    data: { partyId: r.request.partyId },
  });
  return { ok: true };
}
