import { useTranslations } from "next-intl";

import type { ApprovalState } from "@/domain/approval";
import { cn } from "@/lib/utils";

const TONE: Record<ApprovalState, string> = {
  approved: "bg-status-current-bg text-status-current",
  conditional: "bg-status-expiring-bg text-status-expiring",
  pending: "bg-secondary text-secondary-foreground",
  under_verification: "bg-secondary text-secondary-foreground",
  suspended: "bg-status-missing-bg text-status-missing",
  rejected: "bg-status-missing-bg text-status-missing",
  inactive: "border text-muted-foreground",
};

/** Approval state in words: inactive, suspended and rejected read differently, never by color alone. */
export function ApprovalBadge({ state }: { state: ApprovalState }) {
  const t = useTranslations("approvalState");
  return (
    <span
      data-approval={state}
      className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[state])}
    >
      {t(state)}
    </span>
  );
}
