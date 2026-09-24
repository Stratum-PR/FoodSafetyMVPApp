import { FileText, History, LayoutDashboard, type LucideIcon, Send, Settings, Truck } from "lucide-react";

export type NavKey = "panel" | "suppliers" | "documents" | "requests" | "history" | "settings";

/** Main sections. Paths are relative to /{company}; the URL segments are in Spanish. */
export const NAV_ITEMS: { key: NavKey; segment: string; icon: LucideIcon }[] = [
  { key: "panel", segment: "", icon: LayoutDashboard },
  { key: "suppliers", segment: "suplidores", icon: Truck },
  { key: "documents", segment: "documentos", icon: FileText },
  { key: "requests", segment: "solicitudes", icon: Send },
  { key: "history", segment: "historial", icon: History },
  { key: "settings", segment: "ajustes", icon: Settings },
];

export function navHref(company: string, segment: string): string {
  return segment ? `/${company}/${segment}` : `/${company}`;
}
