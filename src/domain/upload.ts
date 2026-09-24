import type { DocumentType } from "./catalog";
import { type IsoDate, isIsoDate } from "./dates";
import type { DocumentSubject, MaterialKind } from "./suppliers";

/*
 * Checks on a new document before it's stored. Everything here comes from the browser, so
 * nothing is trusted: the type must exist and fit the supplier or material, dates must be
 * real and sensible, and the file must really be a PDF, JPEG or PNG (checked by its first
 * bytes, not by its name), under the size limit.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number];
export const LOT_MAX = 40;

export type UploadField = "subject" | "typeCode" | "lotCode" | "issuedOn" | "expiresOn" | "file";

export type UploadError =
  | "required"
  | "unknown_type"
  | "type_not_for_subject"
  | "invalid_date"
  | "future_date"
  | "expires_before_issued"
  | "lot_too_long"
  | "file_too_large"
  | "file_type"
  | "file_empty";

export type UploadInput = {
  subject: DocumentSubject | null;
  /** For material-level documents: the material's kind (ingredient or packaging). */
  materialKind: MaterialKind | null;
  typeCode: string;
  lotCode: string;
  issuedOn: string;
  expiresOn: string;
  file: { size: number; head: Uint8Array } | null;
};

export type UploadCheck =
  | { ok: true; fileType: AllowedFileType; lotCode?: string; issuedOn?: IsoDate; expiresOn?: IsoDate }
  | { ok: false; errors: Partial<Record<UploadField, UploadError>> };

/** The file's real type from its first bytes (magic numbers), or null if it isn't allowed. */
export function sniffFileType(head: Uint8Array): AllowedFileType | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  return null;
}

/** Whether a document type can be filed on this supplier or material. */
export function typeFitsSubject(
  type: DocumentType,
  subject: DocumentSubject,
  materialKind: MaterialKind | null,
): boolean {
  if (type.level === "party") return subject.kind === "party";
  if (subject.kind !== "source" || !materialKind) return false;
  return !type.materialKinds || type.materialKinds.includes(materialKind);
}

export function checkUpload(input: UploadInput, catalog: DocumentType[], today: IsoDate): UploadCheck {
  const errors: Partial<Record<UploadField, UploadError>> = {};

  if (!input.subject) errors.subject = "required";

  const type = catalog.find((t) => t.code === input.typeCode);
  if (!input.typeCode) errors.typeCode = "required";
  else if (!type) errors.typeCode = "unknown_type";
  else if (input.subject && !typeFitsSubject(type, input.subject, input.materialKind)) {
    errors.typeCode = "type_not_for_subject";
  }

  const lotCode = input.lotCode.trim();
  if (type?.perLot && !lotCode) errors.lotCode = "required";
  else if (lotCode.length > LOT_MAX) errors.lotCode = "lot_too_long";

  const issuedOn = input.issuedOn.trim();
  const expiresOn = input.expiresOn.trim();
  if (issuedOn && !isIsoDate(issuedOn)) errors.issuedOn = "invalid_date";
  else if (issuedOn > today) errors.issuedOn = "future_date";
  if (expiresOn && !isIsoDate(expiresOn)) errors.expiresOn = "invalid_date";
  else if (expiresOn && issuedOn && isIsoDate(issuedOn) && expiresOn <= issuedOn) {
    errors.expiresOn = "expires_before_issued";
  }

  let fileType: AllowedFileType | null = null;
  if (!input.file) errors.file = "required";
  else if (input.file.size === 0) errors.file = "file_empty";
  else if (input.file.size > MAX_FILE_BYTES) errors.file = "file_too_large";
  else if (!(fileType = sniffFileType(input.file.head))) errors.file = "file_type";

  if (Object.keys(errors).length || !fileType) return { ok: false, errors };
  return {
    ok: true,
    fileType,
    lotCode: type?.perLot ? lotCode : undefined,
    issuedOn: issuedOn || undefined,
    // Per-lot documents don't expire; ignore a date sent anyway.
    expiresOn: type?.perLot ? undefined : expiresOn || undefined,
  };
}

/** A safe file name for storage and downloads: letters, digits, dot, dash, underscore. */
export function safeFileName(name: string, fileType: AllowedFileType): string {
  const ext = fileType === "application/pdf" ? "pdf" : fileType === "image/png" ? "png" : "jpg";
  // Only the last path segment (browsers may send "C:\\fakepath\\x.pdf"), without its extension.
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/\.[^.]*$/, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return `${base || "documento"}.${ext}`;
}
