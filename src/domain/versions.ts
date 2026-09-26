import { sameSubject, type SupplierDocument } from "./suppliers";

/*
 * Document history. Nothing is ever deleted: accepting a new version marks the previous
 * accepted one as superseded, and every version stays on file. The versions of a document
 * are all documents of the same type for the same supplier or material (per-lot documents:
 * the same lot). The active version is the accepted one.
 */

/**
 * Whether two documents are versions of the same logical record: same type, same supplier, site
 * or material, same lot. A new version replaces only its own record, never another supplier's,
 * material's or lot's document of the same type.
 */
export function sameRecord(
  a: Pick<SupplierDocument, "typeCode" | "subject" | "lotCode">,
  b: Pick<SupplierDocument, "typeCode" | "subject" | "lotCode">,
): boolean {
  return a.typeCode === b.typeCode && sameSubject(a.subject, b.subject) && (a.lotCode ?? null) === (b.lotCode ?? null);
}

/** Every version of `doc` (including itself), newest first by issue date, then receipt. */
export function documentVersions(doc: SupplierDocument, documents: SupplierDocument[]): SupplierDocument[] {
  return documents
    .filter((d) => sameRecord(d, doc))
    .sort(
      (a, b) =>
        (b.issuedOn ?? b.receivedOn).localeCompare(a.issuedOn ?? a.receivedOn) ||
        b.receivedOn.localeCompare(a.receivedOn) ||
        b.id.localeCompare(a.id),
    );
}

/** The version that counts today: the accepted one, if any. */
export function activeVersion(versions: SupplierDocument[]): SupplierDocument | undefined {
  return versions.find((d) => d.state === "accepted");
}
