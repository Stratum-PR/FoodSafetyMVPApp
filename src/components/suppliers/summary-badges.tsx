import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  CircleHelp,
  CircleMinus,
  CircleX,
  Clock,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { documentHref, obligationAnchor, supplierHref } from "@/components/app-shell/nav-items";
import type { CertificationStatus } from "@/domain/certifications";
import type { Fsma204Status } from "@/domain/fsma204";
import type { RequirementSummary } from "@/domain/obligations";
import type { NextAction, SupplierSummary } from "@/domain/supplier-summary";
import type { Risk } from "@/domain/suppliers";
import { cn } from "@/lib/utils";

/*
 * The small pieces the supplier list and the supplier page share, so both show a supplier the
 * same way. Every state is a word plus an icon or tone; "not assessed" is always said, never blank.
 */

const PILL = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";
const NOT_ASSESSED = "border border-dashed text-muted-foreground";

const RISK_TONE: Record<Risk, string> = {
  low: "bg-status-current-bg text-status-current",
  medium: "bg-status-expiring-bg text-status-expiring",
  high: "bg-status-missing-bg text-status-missing",
};

export function RiskBadge({ rating }: { rating: Risk | null }) {
  const t = useTranslations("risk");
  return (
    <span data-risk={rating ?? "not_assessed"} className={cn(PILL, rating ? RISK_TONE[rating] : NOT_ASSESSED)}>
      {rating ? null : <CircleHelp aria-hidden className="size-3.5" />}
      {t(rating ?? "not_assessed")}
    </span>
  );
}

const CERT: Record<CertificationStatus, { Icon: LucideIcon; tone: string }> = {
  verified: { Icon: BadgeCheck, tone: "bg-status-current-bg text-status-current" },
  expiring: { Icon: Clock, tone: "bg-status-expiring-bg text-status-expiring" },
  expired: { Icon: CircleX, tone: "bg-status-missing-bg text-status-missing" },
  pending_verification: { Icon: ClipboardCheck, tone: "bg-secondary text-secondary-foreground" },
  audit_only: { Icon: ClipboardCheck, tone: "bg-secondary text-secondary-foreground" },
  missing: { Icon: CircleAlert, tone: "bg-status-missing-bg text-status-missing" },
  not_assessed: { Icon: CircleHelp, tone: NOT_ASSESSED },
};

export function CertificationBadge({ status }: { status: CertificationStatus }) {
  const t = useTranslations("certification.status");
  const { Icon, tone } = CERT[status];
  return (
    <span data-certification={status} className={cn(PILL, tone)}>
      <Icon aria-hidden className="size-3.5" />
      {t(status)}
    </span>
  );
}

const FSMA_TONE: Record<Fsma204Status, string> = {
  applicable: "bg-secondary text-secondary-foreground",
  not_applicable: "border text-muted-foreground",
  exempt: "border text-muted-foreground",
  not_assessed: NOT_ASSESSED,
};

export function Fsma204Badge({ status }: { status: Fsma204Status }) {
  const t = useTranslations("fsma204.status");
  return (
    <span data-fsma204={status} className={cn(PILL, FSMA_TONE[status])}>
      {status === "not_assessed" ? <CircleHelp aria-hidden className="size-3.5" /> : null}
      {status === "not_applicable" ? <CircleMinus aria-hidden className="size-3.5" /> : null}
      {t(status)}
    </span>
  );
}

/** "12 de 15 vigentes" plus what's open, with the blocking count called out. */
export function RequirementsSummaryText({ summary, className }: { summary: RequirementSummary; className?: string }) {
  const t = useTranslations("requirements");
  if (summary.applicable === 0) {
    return <span className={cn("text-sm text-muted-foreground", className)}>{t("none")}</span>;
  }
  const c = summary.counts;
  const parts = [
    c.missing ? t("missing", { count: c.missing }) : null,
    c.expired ? t("expired", { count: c.expired }) : null,
    c.rejected ? t("rejected", { count: c.rejected }) : null,
    c.awaiting_review ? t("awaiting", { count: c.awaiting_review }) : null,
    c.expiring ? t("expiring", { count: c.expiring }) : null,
    c.waived ? t("waived", { count: c.waived }) : null,
  ].filter(Boolean);
  return (
    <span className={cn("inline-grid gap-0.5 text-right md:text-left", className)}>
      <span className="text-sm font-semibold tabular-nums">
        {t("met", { met: summary.met, applicable: summary.applicable })}
      </span>
      {summary.blockingOpen ? (
        <span className="text-xs font-semibold text-status-missing">
          {t("blocking", { count: summary.blockingOpen })}
        </span>
      ) : null}
      <span className="text-xs text-muted-foreground">{parts.length ? parts.join(" · ") : t("allCurrent")}</span>
    </span>
  );
}

/** Where the next action happens. */
export function nextActionHref(company: string, partyId: string, action: NextAction): string {
  switch (action.kind) {
    case "review_document":
      return documentHref(company, action.documentId);
    case "blocking_gap":
    case "gap":
    case "expiring":
      return supplierHref(company, partyId, { tab: "documentos", anchor: obligationAnchor(action.key) });
    case "open_issue":
      return supplierHref(company, partyId, { tab: "incidencias", anchor: `nc-${action.nonconformityId}` });
    case "assess_risk":
      return supplierHref(company, partyId, { anchor: "riesgo" });
    case "assess_fsma204":
      return supplierHref(company, partyId, { anchor: "fsma204" });
    case "conditions_overdue":
    case "review_overdue":
    case "decide_approval":
      return supplierHref(company, partyId, { anchor: "aprobacion" });
  }
}

/** The next action as a link with a one-line explanation, or a quiet "nothing pending". */
export function NextActionLink({
  company,
  summary,
  dateText,
}: {
  company: string;
  summary: Pick<SupplierSummary, "partyId" | "nextAction">;
  /** Formats an ISO date for the overdue messages. */
  dateText: (iso: string) => string;
}) {
  const t = useTranslations("nextAction");
  const action = summary.nextAction;
  if (!action) return <span className="text-xs text-muted-foreground">{t("none")}</span>;
  const label =
    action.kind === "conditions_overdue" || action.kind === "review_overdue"
      ? t(action.kind, { date: dateText(action.since) })
      : "count" in action
        ? t(action.kind, { count: action.count })
        : t(action.kind);
  return (
    <Link
      href={nextActionHref(company, summary.partyId, action)}
      data-next-action={action.kind}
      className="inline-flex items-start gap-1 text-sm font-semibold text-primary hover:underline"
    >
      <span>{label}</span>
      <ArrowRight aria-hidden className="mt-0.5 size-3.5 shrink-0" />
    </Link>
  );
}
