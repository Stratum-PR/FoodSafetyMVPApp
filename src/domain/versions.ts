import { sameSubject, type SupplierDocument } from "./suppliers";

/*
 * Document history. Nothing is ever deleted: accepting a new version marks the previous
 * accepted one as superseded, and every version stays on file. The versions of a document
 * are all documents of the same type for the same supplier or material (per-lot documents:
 * the same lot). The active version is the accepted one.
 */

/** Every version of `doc` (including itself), newest first by issue date, then receipt. */
export function documentVersions(doc: SupplierDocument, documents: SupplierDocument[]): SupplierDocument[] {
  return documents
    .filter(
      (d) =>
        d.typeCode === doc.typeCode &&
        sameSubject(d.subject, doc.subject) &&
        (doc.lotCode === undefined ? d.lotCode === undefined : d.lotCode === doc.lotCode),
    )
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
