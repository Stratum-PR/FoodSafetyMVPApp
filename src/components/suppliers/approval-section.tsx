import { TriangleAlert } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { ApprovalBadge } from "@/components/suppliers/approval-badge";
import { ApprovalForm } from "@/components/suppliers/approval-form";
import { NonconformityCloseForm } from "@/components/suppliers/nonconformity-close-form";
import { NonconformityForm } from "@/components/suppliers/nonconformity-form";
import { approvalState, CONDITIONS_MAX_MONTHS, REVIEW_DEFAULT_MONTHS, REVIEW_MAX_MONTHS } from "@/domain/approval";
import { addDays, addMonths } from "@/domain/dates";
import { isOpen, type Severity } from "@/domain/nonconformity";
import { cn } from "@/lib/utils";
import { type ApprovalPanel, getApprovalPanel } from "@/server/approvals";
import type { RequestContext } from "@/server/context";
import { changeStatusAction, closeNonconformityAction, recordNonconformityAction } from "@/server/supplier-actions";

const SEVERITY_TONE: Record<Severity, string> = {
  minor: "bg-secondary text-secondary-foreground",
  major: "bg-status-expiring-bg text-status-expiring",
  critical: "bg-status-missing-bg text-status-missing",
};

type HistoryRow = ApprovalPanel["history"][number];
type NonconformityRow = ApprovalPanel["nonconformities"][number];

/** Approval status and its terms, warnings, the decision form, and the approval history. */
export async function ApprovalSection({ ctx, partyId }: { ctx: RequestContext; partyId: string }) {
  const [panel, t, format] = await Promise.all([
    getApprovalPanel(ctx, partyId),
    getTranslations("approval"),
    getFormatter(),
  ]);
  if (!panel) return null;

  const company = ctx.company.slug;
  // Noon UTC is the same calendar day in Puerto Rico.
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });
  const last = panel.history[0];
  const state = approvalState(panel);
  const terms = panel.terms;
  const sourceLabel = new Map(panel.sources.map((s) => [s.id, s.label]));

  const historyColumns: Column<HistoryRow>[] = [
    { key: "date", header: t("col.date"), primary: true, cell: (r) => date(r.on), className: "tabular-nums" },
    { key: "decision", header: t("col.decision"), cell: (r) => t(`actions.${r.action}`) },
    { key: "result", header: t("col.result"), cell: (r) => <ApprovalBadge state={approvalState(r.to)} /> },
    { key: "by", header: t("col.by"), cell: (r) => r.actorName },
    {
      key: "detail",
      header: t("col.detail"),
      cell: (r) => (
        <span className="grid gap-0.5 text-sm">
          {r.reason ? <span>{r.reason}</span> : null}
          {r.basis?.length ? (
            <span className="text-xs text-muted-foreground">
              {t("basisShort", { list: r.basis.map((b) => t(`basis.${b}`)).join(", ") })}
            </span>
          ) : null}
          {r.terms?.conditions ? <span>{r.terms.conditions}</span> : null}
          {r.terms?.reviewBy ? (
            <span className="text-xs text-muted-foreground">{t("reviewBy", { date: date(r.terms.reviewBy) })}</span>
          ) : null}
          {r.requirementsAt ? (
            <span className="text-xs text-muted-foreground">{t("requirementsAt", r.requirementsAt)}</span>
          ) : r.compliancePercent !== undefined ? (
            <span className="text-xs text-muted-foreground">{t("complianceAt", { percent: r.compliancePercent })}</span>
          ) : null}
          {!r.reason && !r.terms && !r.basis && !r.requirementsAt && r.compliancePercent === undefined ? "—" : null}
        </span>
      ),
    },
  ];

  return (
    <section id="aprobacion" className="grid scroll-mt-20 grid-cols-1 gap-3" aria-labelledby="approval-title">
      <div>
        <h2 id="approval-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid content-start gap-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ApprovalBadge state={state} />
            {terms?.reviewBy && (state === "approved" || state === "conditional") ? (
              <span className="text-sm text-muted-foreground">{t("reviewBy", { date: date(terms.reviewBy) })}</span>
            ) : null}
          </div>
          <p className="text-sm">
            {last
              ? t("last", { action: t(`actions.${last.action}`), name: last.actorName, date: date(last.on) })
              : t("none")}
          </p>
          {state === "conditional" && terms?.conditions ? (
            <div
              data-testid="conditions"
              className="grid gap-1.5 rounded-lg border border-status-expiring/40 bg-status-expiring-bg p-3 text-sm text-status-expiring"
            >
              <p className="font-semibold">{t("conditions")}</p>
              <p>{terms.conditions}</p>
              <dl className="grid gap-1 text-xs sm:grid-cols-2">
                {terms.ownerName ? <Term label={t("ownerLabel")}>{terms.ownerName}</Term> : null}
                {terms.effectiveOn ? <Term label={t("effectiveOnLabel")}>{date(terms.effectiveOn)}</Term> : null}
                <Term label={t("scopeLabel")}>
                  {terms.allowedSourceIds?.length
                    ? terms.allowedSourceIds.map((id) => sourceLabel.get(id) ?? id).join(", ")
                    : t("scopeAll")}
                </Term>
                <Term label={t("restrictionsLabel")}>
                  {terms.restrictions?.length
                    ? terms.restrictions.map((r) => t(`restrictions.${r}`)).join(", ")
                    : t("restrictionsNone")}
                </Term>
              </dl>
            </div>
          ) : null}
          {panel.warnings.length ? (
            <ul className="grid gap-2" aria-label={t("warningsLabel")}>
              {panel.warnings.map((w) => (
                <li
                  key={w.kind}
                  data-warning={w.kind}
                  className="flex gap-2 rounded-lg border border-status-expiring/40 bg-status-expiring-bg p-3 text-sm text-status-expiring"
                >
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {w.kind === "conditions_overdue" || w.kind === "review_overdue"
                    ? t(`warnings.${w.kind}`, { date: date(w.since) })
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
              blockingOpen={panel.blockingOpen}
              today={ctx.today}
              defaultReviewBy={addMonths(ctx.today, REVIEW_DEFAULT_MONTHS)}
              minReviewBy={addDays(ctx.today, 1)}
              maxReviewBy={addMonths(ctx.today, REVIEW_MAX_MONTHS)}
              maxConditionalReviewBy={addMonths(ctx.today, CONDITIONS_MAX_MONTHS)}
              owners={panel.owners}
              sources={panel.sources}
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
  );
}

/** Nonconformities: the open ones first, each closable with a note; and the form to record one. */
export async function NonconformitySection({ ctx, partyId }: { ctx: RequestContext; partyId: string }) {
  const [panel, t, format] = await Promise.all([
    getApprovalPanel(ctx, partyId),
    getTranslations("nonconformities"),
    getFormatter(),
  ]);
  if (!panel) return null;
  const company = ctx.company.slug;
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });
  const open = panel.nonconformities.filter(isOpen).length;

  const columns: Column<NonconformityRow>[] = [
    {
      key: "date",
      header: t("col.date"),
      primary: true,
      className: "tabular-nums",
      cell: (n) => <span id={`nc-${n.id}`}>{date(n.date)}</span>,
    },
    {
      key: "severity",
      header: t("col.severity"),
      cell: (n) => (
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", SEVERITY_TONE[n.severity])}>
          {t(`severity.${n.severity}`)}
        </span>
      ),
    },
    { key: "description", header: t("col.description"), cell: (n) => n.description },
    { key: "lot", header: t("col.lot"), cell: (n) => n.lotCode ?? "—" },
    { key: "by", header: t("col.by"), cell: (n) => n.recordedByName },
    {
      key: "status",
      header: t("col.status"),
      cell: (n) =>
        isOpen(n) ? (
          <span className="grid gap-1">
            <span className="text-xs font-semibold text-status-expiring">{t("open")}</span>
            {panel.canRecordNonconformity ? (
              <NonconformityCloseForm action={closeNonconformityAction.bind(null, company, partyId, n.id)} />
            ) : null}
          </span>
        ) : (
          <span className="grid gap-0.5 text-xs text-muted-foreground">
            <span className="font-semibold">
              {t("closedBy", { name: n.closedByName ?? "", date: n.closedOn ? date(n.closedOn) : "" })}
            </span>
            {n.closeNote ? <span>{n.closeNote}</span> : null}
          </span>
        ),
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-3" aria-labelledby="nc-title">
      <div>
        <h2 id="nc-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
        <p className="mt-1 text-sm font-medium">{t("openCount", { count: open })}</p>
      </div>
      {panel.nonconformities.length ? (
        <ResponsiveTable columns={columns} rows={panel.nonconformities} rowKey={(n) => n.id} caption={t("caption")} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      )}
      {panel.canRecordNonconformity ? (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer font-semibold text-primary">{t("add")}</summary>
          <div className="mt-4">
            <NonconformityForm
              key={panel.nonconformities.length}
              action={recordNonconformityAction.bind(null, company, partyId)}
              today={ctx.today}
            />
          </div>
        </details>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("capaLater")}</p>
    </section>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
