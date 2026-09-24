import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export type DocumentStatus = "current" | "expiring" | "missing";

const STYLES: Record<DocumentStatus, { className: string; Icon: typeof CircleCheck }> = {
  current: { className: "bg-status-current-bg text-status-current", Icon: CircleCheck },
  expiring: { className: "bg-status-expiring-bg text-status-expiring", Icon: Clock },
  missing: { className: "bg-status-missing-bg text-status-missing", Icon: CircleAlert },
};

/** Vigente / Por vencer / Falta. Status is shown by color, icon and word, never color alone. */
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
