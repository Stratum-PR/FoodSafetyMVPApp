import { useTranslations } from "next-intl";

import type { ComplianceSummary } from "@/domain/compliance";

/** "2 vencidos · 1 falta" under the compliance bar; only the counts that aren't zero. */
export function ComplianceGaps({ summary }: { summary: ComplianceSummary }) {
  const t = useTranslations("suppliers");
  if (summary.total === 0) return <span className="text-xs text-muted-foreground">{t("noRequirements")}</span>;

  const { expired, missing, expiring } = summary.counts;
  const parts = [
    expired ? t("expiredCount", { count: expired }) : null,
    missing ? t("missingCount", { count: missing }) : null,
    expiring ? t("expiringCount", { count: expiring }) : null,
  ].filter(Boolean);

  return <span className="text-xs text-muted-foreground">{parts.length ? parts.join(" · ") : t("complete")}</span>;
}
