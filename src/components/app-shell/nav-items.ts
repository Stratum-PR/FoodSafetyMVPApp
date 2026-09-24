import { FileText, History, LayoutDashboard, type LucideIcon, Send, Settings, Truck } from "lucide-react";

import type { Permission } from "@/domain/permissions";

export type NavKey = "panel" | "suppliers" | "documents" | "requests" | "history" | "settings";

/** Main sections. Paths are relative to /{company}; the URL segments are in Spanish. */
export const NAV_ITEMS: { key: NavKey; segment: string; icon: LucideIcon; permission: Permission }[] = [
  { key: "panel", segment: "", icon: LayoutDashboard, permission: "suppliers.view" },
  { key: "suppliers", segment: "suplidores", icon: Truck, permission: "suppliers.view" },
  { key: "documents", segment: "documentos", icon: FileText, permission: "documents.view" },
  { key: "requests", segment: "solicitudes", icon: Send, permission: "requests.send" },
  { key: "history", segment: "historial", icon: History, permission: "history.view" },
  { key: "settings", segment: "ajustes", icon: Settings, permission: "settings.manage" },
];

export function navHref(company: string, segment: string): string {
  return segment ? `/${company}/${segment}` : `/${company}`;
}

export function supplierHref(company: string, supplierId: string): string {
  return `/${company}/suplidores/${encodeURIComponent(supplierId)}`;
}

export function documentHref(company: string, documentId: string): string {
  return `/${company}/documentos/${encodeURIComponent(documentId)}`;
}

/** The upload form, optionally pre-filled: a supplier, what it's for (a source id) and a type. */
export function uploadHref(company: string, prefill: { supplier?: string; para?: string; tipo?: string } = {}): string {
  const query = new URLSearchParams();
  if (prefill.supplier) query.set("suplidor", prefill.supplier);
  if (prefill.para) query.set("para", prefill.para);
  if (prefill.tipo) query.set("tipo", prefill.tipo);
  const q = query.toString();
  return `/${company}/documentos/subir${q ? `?${q}` : ""}`;
}
