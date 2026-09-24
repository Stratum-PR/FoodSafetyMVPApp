import { useTranslations } from "next-intl";

import type { Approval } from "@/domain/suppliers";
import { cn } from "@/lib/utils";

const TONE: Record<Approval, string> = {
  approved: "bg-status-current-bg text-status-current",
  conditional: "bg-status-expiring-bg text-status-expiring",
  pending: "bg-secondary text-secondary-foreground",
  suspended: "bg-status-missing-bg text-status-missing",
};

export function ApprovalBadge({ approval }: { approval: Approval }) {
  const t = useTranslations("approval");
  return (
    <span
      data-approval={approval}
      className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[approval])}
    >
      {t(approval)}
    </span>
  );
}
