import { TriangleAlert } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { ApprovalBadge } from "@/components/suppliers/approval-badge";
import { ApprovalForm } from "@/components/suppliers/approval-form";
import { NonconformityForm } from "@/components/suppliers/nonconformity-form";
import { CONDITIONS_MAX_MONTHS } from "@/domain/approval";
import { addDays, addMonths } from "@/domain/dates";
import type { Severity } from "@/domain/nonconformity";
import { cn } from "@/lib/utils";
import { type ApprovalPanel, getApprovalPanel } from "@/server/approvals";
import type { RequestContext } from "@/server/context";
import { changeStatusAction, recordNonconformityAction } from "@/server/supplier-actions";

const SEVERITY_TONE: Record<Severity, string> = {
  minor: "bg-secondary text-secondary-foreground",
  major: "bg-status-expiring-bg text-status-expiring",
  critical: "bg-status-missing-bg text-status-missing",
};

type HistoryRow = ApprovalPanel["history"][number];
type NonconformityRow = ApprovalPanel["nonconformities"][number];

/** Approval status, warnings, the decision form, the approval history and nonconformities. */
export async function ApprovalSection({ ctx, partyId }: { ctx: RequestContext; partyId: string }) {
  const [panel, t, tNc, tLifecycle, format] = await Promise.all([
    getApprovalPanel(ctx, partyId),
    getTranslations("approval"),
    getTranslations("nonconformities"),
    getTranslations("lifecycle"),
    getFormatter(),
  ]);
  if (!panel) return null;

  const company = ctx.company.slug;
  // Noon UTC is the same calendar day in Puerto Rico.
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });
  const last = panel.history[0];

  const historyColumns: Column<HistoryRow>[] = [
    { key: "date", header: t("col.date"), primary: true, cell: (r) => date(r.on), className: "tabular-nums" },
    { key: "decision", header: t("col.decision"), cell: (r) => t(`actions.${r.action}`) },
    {
      key: "result",
      header: t("col.result"),
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <ApprovalBadge approval={r.to.approval} />
          <span className="text-xs text-muted-foreground">{tLifecycle(r.to.lifecycle)}</span>
        </span>
      ),
    },
    { key: "by", header: t("col.by"), cell: (r) => r.actorName },
    {
      key: "detail",
      header: t("col.detail"),
      cell: (r) => (
        <span className="grid gap-0.5 text-sm">
          {r.reason ? <span>{r.reason}</span> : null}
          {r.conditions ? (
            <span>
              {r.conditions}
              {r.reviewBy ? ` · ${t("reviewBy", { date: date(r.reviewBy) })}` : ""}
            </span>
          ) : null}
          {r.compliancePercent !== undefined ? (
            <span className="text-xs text-muted-foreground">{t("complianceAt", { percent: r.compliancePercent })}</span>
          ) : null}
          {!r.reason && !r.conditions && r.compliancePercent === undefined ? "—" : null}
        </span>
      ),
    },
  ];

  const ncColumns: Column<NonconformityRow>[] = [
    { key: "date", header: tNc("col.date"), primary: true, cell: (n) => date(n.date), className: "tabular-nums" },
    {
      key: "severity",
      header: tNc("col.severity"),
      cell: (n) => (
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", SEVERITY_TONE[n.severity])}>
          {tNc(`severity.${n.severity}`)}
        </span>
      ),
    },
    { key: "description", header: tNc("col.description"), cell: (n) => n.description },
    { key: "lot", header: tNc("col.lot"), cell: (n) => n.lotCode ?? "—" },
    { key: "by", header: tNc("col.by"), cell: (n) => n.recordedByName },
  ];

  return (
    <>
      <section className="grid grid-cols-1 gap-3" aria-labelledby="approval-title">
        <div>
          <h2 id="approval-title" className="text-lg font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid content-start gap-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ApprovalBadge approval={panel.approval} />
              <span className="text-sm text-muted-foreground">{tLifecycle(panel.lifecycle)}</span>
            </div>
            <p className="text-sm">
              {last
                ? t("last", { action: t(`actions.${last.action}`), name: last.actorName, date: date(last.on) })
                : t("none")}
            </p>
            {panel.approval === "conditional" && panel.conditions ? (
              <div className="rounded-lg bg-status-expiring-bg p-3 text-sm text-status-expiring">
                <p className="font-semibold">{t("conditions")}</p>
                <p>{panel.conditions}</p>
                {panel.conditionsReviewBy ? (
                  <p className="mt-1 text-xs">{t("reviewBy", { date: date(panel.conditionsReviewBy) })}</p>
                ) : null}
              </div>
            ) : null}
            {panel.warnings.length ? (
              <ul className="grid gap-2" aria-label={t("title")}>
                {panel.warnings.map((w) => (
                  <li
                    key={w.kind}
                    data-warning={w.kind}
                    className="flex gap-2 rounded-lg border border-status-expiring/40 bg-status-expiring-bg p-3 text-sm text-status-expiring"
                  >
                    <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {w.kind === "conditions_overdue"
                      ? t("warnings.conditions_overdue", { date: date(w.since) })
                      : t(`warnings.${w.kind}`, { count: w.count })}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 font-semibold">{t("decide")}</h3>
            {panel.actions.length ? (
              <ApprovalForm
                // Remount after each decision so the form starts clean for the new status.
                key={`${panel.approval}-${panel.lifecycle}-${panel.history.length}`}
                action={changeStatusAction.bind(null, company, partyId)}
                actions={panel.actions}
                minReviewBy={addDays(ctx.today, 1)}
                maxReviewBy={addMonths(ctx.today, CONDITIONS_MAX_MONTHS)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t(`denial.${panel.denial ?? "no_permission"}`)}</p>
            )}
          </div>
        </div>

        <h3 className="mt-2 font-semibold">{t("history")}</h3>
        {panel.history.length ? (
          <ResponsiveTable
            columns={historyColumns}
            rows={panel.history}
            rowKey={(r) => r.id}
            caption={t("historyCaption")}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3" aria-labelledby="nc-title">
        <div>
          <h2 id="nc-title" className="text-lg font-semibold">
            {tNc("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{tNc("hint")}</p>
        </div>
        {panel.nonconformities.length ? (
          <ResponsiveTable
            columns={ncColumns}
            rows={panel.nonconformities}
            rowKey={(n) => n.id}
            caption={tNc("caption")}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{tNc("none")}</p>
        )}
        {panel.canRecordNonconformity ? (
          <details className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer font-semibold text-primary">{tNc("add")}</summary>
            <div className="mt-4">
              <NonconformityForm
                key={panel.nonconformities.length}
                action={recordNonconformityAction.bind(null, company, partyId)}
                today={ctx.today}
              />
            </div>
          </details>
        ) : null}
      </section>
    </>
  );
}
