/** Request screens. Paths are relative to /{company}; the URL segments are in Spanish. */

export function requestsHref(company: string, estado?: string): string {
  return `/${company}/solicitudes${estado ? `?estado=${encodeURIComponent(estado)}` : ""}`;
}

export function requestHref(company: string, id: string): string {
  return `/${company}/solicitudes/${encodeURIComponent(id)}`;
}

/** The new-request form, optionally for one supplier and with some gaps pre-checked. */
export function newRequestHref(company: string, prefill: { supplier?: string; keys?: string[] } = {}): string {
  const q = new URLSearchParams();
  if (prefill.supplier) q.set("suplidor", prefill.supplier);
  for (const k of prefill.keys ?? []) q.append("pedir", k);
  const query = q.toString();
  return `/${company}/solicitudes/nueva${query ? `?${query}` : ""}`;
}

export function emailLogHref(company: string): string {
  return `/${company}/solicitudes/correos`;
}
