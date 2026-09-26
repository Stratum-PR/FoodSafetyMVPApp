import { CircleAlert, CircleCheck, CircleMinus, CircleX, Clock, Hourglass, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ObligationStatus } from "@/domain/obligations";
import { cn } from "@/lib/utils";

export type DocumentStatus = ObligationStatus;

const STYLES: Record<DocumentStatus, { className: string; Icon: typeof CircleCheck }> = {
  current: { className: "bg-status-current-bg text-status-current", Icon: CircleCheck },
  expiring: { className: "bg-status-expiring-bg text-status-expiring", Icon: Clock },
  expired: { className: "bg-status-missing-bg text-status-missing", Icon: CircleX },
  missing: { className: "bg-status-missing-bg text-status-missing", Icon: CircleAlert },
  rejected: { className: "bg-status-missing-bg text-status-missing", Icon: CircleX },
  awaiting_review: { className: "bg-secondary text-secondary-foreground", Icon: Hourglass },
  waived: { className: "bg-secondary text-secondary-foreground", Icon: ShieldCheck },
  not_applicable: { className: "border text-muted-foreground", Icon: CircleMinus },
};

/**
 * Vigente / Por vencer / Vencido / Falta, plus the obligation states (por revisar, rechazado,
 * dispensado, no aplica). Status is shown by color, icon and word, never color alone.
 */
export function StatusPill({ status, className }: { status: DocumentStatus; className?: string }) {
  const t = useTranslations("status");
  const { className: tone, Icon } = STYLES[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {t(status)}
    </span>
  );
}
