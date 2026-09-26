import { DEFAULT_CATALOG } from "@/domain/catalog";
import type { Obligation } from "@/domain/obligations";

import type { SourceView } from "./supplier-detail";

/*
 * The supplier's materials × material-level documents, for the matrix on the supplier page
 * (one view per material, or transposed, per document). Only materials bought today count:
 * nothing is required of the others. A cell is null when that document doesn't apply to that
 * material (e.g. an allergen statement for packaging).
 */

/** Waived ones are excused and current ones are done; everything else still needs something. */
const isOpen = (o: Obligation) => o.status !== "current" && o.status !== "waived";

export type MatrixView = "ingrediente" | "documento";

export type MatrixRow = {
  source: SourceView;
  cells: Record<string, Obligation | null>;
  /** Required documents that aren't current (expiring, awaiting review, expired, rejected or missing). */
  open: number;
  required: number;
};

export type Matrix = {
  /** Document type codes, in catalog order. */
  documents: string[];
  rows: MatrixRow[];
  /** Materials offered but not bought today (not in the matrix). */
  inactive: number;
};

export function buildMatrix(sources: SourceView[]): Matrix {
  const active = sources.filter((s) => s.commercial === "active");
  const used = new Set(active.flatMap((s) => s.requirements.map((r) => r.requirement.anyOf[0])));
  const documents = DEFAULT_CATALOG.map((t) => t.code).filter((code) => used.has(code));

  const rows = active.map((source) => {
    const cells: Record<string, Obligation | null> = {};
    for (const code of documents) {
      cells[code] = source.requirements.find((r) => r.requirement.anyOf[0] === code) ?? null;
    }
    const results = Object.values(cells).filter((c): c is Obligation => c !== null && c.status !== "not_applicable");
    return { source, cells, open: results.filter(isOpen).length, required: results.length };
  });
  return { documents, rows, inactive: sources.length - active.length };
}

/** Per document (the transposed view): the cell for each material, and how many aren't current. */
export function byDocument(matrix: Matrix): { code: string; open: number; required: number }[] {
  return matrix.documents.map((code) => {
    const cells = matrix.rows
      .map((r) => r.cells[code])
      .filter((c): c is Obligation => c !== null && c.status !== "not_applicable");
    return { code, open: cells.filter(isOpen).length, required: cells.length };
  });
}
