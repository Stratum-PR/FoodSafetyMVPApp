import { useTranslations } from "next-intl";

import type { DocumentState } from "@/domain/suppliers";
import { cn } from "@/lib/utils";

const TONE: Record<DocumentState, string> = {
  pending_review: "bg-secondary text-secondary-foreground",
  accepted: "bg-status-current-bg text-status-current",
  rejected: "bg-status-missing-bg text-status-missing",
  superseded: "bg-muted text-muted-foreground",
};

/** Por revisar / Aceptado / Rechazado / Reemplazado: where a document is in review. */
export function DocumentStateBadge({ state }: { state: DocumentState }) {
  const t = useTranslations("supplier.docState");
  return (
    <span
      data-state={state}
      className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[state])}
    >
      {t(state)}
    </span>
  );
}
