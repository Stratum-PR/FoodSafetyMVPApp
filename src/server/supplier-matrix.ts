import { DEFAULT_CATALOG } from "@/domain/catalog";
import type { RequirementResult } from "@/domain/status";

import type { SourceView } from "./supplier-detail";

/*
 * The supplier's materials × material-level documents, for the matrix on the supplier page
 * (one view per material, or transposed, per document). Only materials bought today count:
 * nothing is required of the others. A cell is null when that document doesn't apply to that
 * material (e.g. an allergen statement for packaging).
 */

export type MatrixView = "ingrediente" | "documento";

export type MatrixRow = {
  source: SourceView;
  cells: Record<string, RequirementResult | null>;
  /** Required documents that aren't current (expiring, expired or missing). */
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
  const active = sources.filter((s) => s.status === "active");
  const used = new Set(active.flatMap((s) => s.requirements.map((r) => r.requirement.anyOf[0])));
  const documents = DEFAULT_CATALOG.map((t) => t.code).filter((code) => used.has(code));

  const rows = active.map((source) => {
    const cells: Record<string, RequirementResult | null> = {};
    for (const code of documents) {
      cells[code] = source.requirements.find((r) => r.requirement.anyOf[0] === code) ?? null;
    }
    const results = Object.values(cells).filter((c): c is RequirementResult => c !== null);
    return { source, cells, open: results.filter((r) => r.status !== "current").length, required: results.length };
  });
  return { documents, rows, inactive: sources.length - active.length };
}

/** Per document (the transposed view): the cell for each material, and how many aren't current. */
export function byDocument(matrix: Matrix): { code: string; open: number; required: number }[] {
  return matrix.documents.map((code) => {
    const cells = matrix.rows.map((r) => r.cells[code]).filter((c): c is RequirementResult => c !== null);
    return { code, open: cells.filter((c) => c.status !== "current").length, required: cells.length };
  });
}
