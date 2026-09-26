import {
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  FileClock,
  FileWarning,
  type LucideIcon,
  Truck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { navHref, supplierHref } from "@/components/app-shell/nav-items";
import { ComplianceBar, complianceTone } from "@/components/compliance-bar";
import { PageHeader } from "@/components/page-header";
import { sectionText } from "@/components/section-placeholder";
import { StatusPill } from "@/components/status-pill";
import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import { daysBetween } from "@/domain/dates";
import { SEVERITIES } from "@/domain/nonconformity";
import type { RequirementStatus } from "@/domain/status";
import { isLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { getRequestContext } from "@/server/context";
import { needsAttention } from "@/server/supplier-filters";
import { getPanelSummary, listSuppliers } from "@/server/suppliers";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await sectionText("panel")).title };
}

const ATTENTION_LIMIT = 8;
const STATUSES: RequirementStatus[] = ["current", "expiring", "expired", "missing"];
const TONE_TEXT = { current: "text-status-current", expiring: "text-status-expiring", missing: "text-status-missing" };
const SEGMENT: Record<RequirementStatus, string> = {
  current: "bg-status-current",
  expiring: "bg-status-expiring",
  expired: "bg-status-missing",
  missing: "bg-status-missing/40",
};

export default async function Page({ params }: PageProps<"/[company]">) {
  const { company } = await params;
  const ctx = await getRequestContext(company);
  const [summary, suppliers, text, t, tSeverity, format, locale] = await Promise.all([
    getPanelSummary(ctx),
    listSuppliers(ctx),
    sectionText("panel"),
    getTranslations("panel"),
    getTranslations("nonconformities.severity"),
    getFormatter(),
    getLocale(),
  ]);
  const lang = isLocale(locale) ? locale : "es";
  const { compliance } = summary;
  const met = compliance.counts.current + compliance.counts.expiring;
  const lowest = suppliers.filter((s) => s.lifecycle !== "inactive" && s.compliance.total > 0).slice(0, 5);
  const pendingCount = suppliers.filter(needsAttention).length;
  const suppliersHref = navHref(company, "suplidores");
  // Noon UTC is the same calendar day in Puerto Rico.
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });

  const ops = summary.operations;
  const supplierLink = (id: string) => supplierHref(company, id);

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageHeader title={text.title} description={text.description} />

      <section aria-labelledby="ops-heading" className="grid grid-cols-1 gap-4">
        <SectionHeading id="ops-heading" title={t("operations")} hint={t("operationsHint")} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            icon={FileClock}
            label={t("toReview")}
            value={ops.reviewQueue.count}
            detail={
              ops.reviewQueue.oldestDays === null
                ? t("queueEmpty")
                : t("oldestWaiting", { days: ops.reviewQueue.oldestDays })
            }
            href={navHref(company, "documentos")}
          />
          <Stat
            icon={ClipboardCheck}
            label={t("pendingApproval")}
            value={summary.suppliers.pendingApproval}
            href={`${suppliersHref}?aprobacion=pending`}
          />
          <Stat
            icon={CalendarClock}
            label={t("conditionsDue")}
            value={ops.conditionsDue.length}
            detail={t("conditionsDueHint", { overdue: ops.conditionsDue.filter((c) => c.overdue).length })}
            href={`${suppliersHref}?aprobacion=conditional`}
          />
          <Stat
            icon={FileWarning}
            label={t("gaps")}
            value={ops.expiry.expired + ops.expiry.missing}
            detail={t("gapsHint", { expired: ops.expiry.expired, missing: ops.expiry.missing })}
            href={`${suppliersHref}?pendientes=1`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel title={t("attention")} hint={t("attentionHint")}>
            <dl aria-label={t("outlookLabel")} className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["bucketExpired", ops.expiry.expired],
                  ["bucket30", ops.expiry.within30],
                  ["bucket60", ops.expiry.within60],
                  ["bucket90", ops.expiry.within90],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-muted px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{t(key)}</dt>
                  <dd className="text-xl font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {summary.attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("attentionEmpty")}</p>
            ) : (
              <>
                <ul className="divide-y">
                  {summary.attention.slice(0, ATTENTION_LIMIT).map((a) => {
                    const days = daysBetween(ctx.today, a.expiresOn);
                    return (
                      <li
                        key={`${a.partyId}-${a.typeCode}-${a.expiresOn}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
                      >
                        <div className="min-w-48 flex-1">
                          <p className="truncate font-semibold">
                            <Link href={supplierLink(a.partyId)} className="hover:text-primary hover:underline">
                              {a.partyName}
                            </Link>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {findType(DEFAULT_CATALOG, a.typeCode)?.name[lang] ?? a.typeCode}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground tabular-nums sm:text-right">
                            <time dateTime={a.expiresOn}>{date(a.expiresOn)}</time>
                            <br />
                            {days >= 0 ? t("inDays", { days }) : t("daysAgo", { days: -days })}
                          </span>
                          <StatusPill status={a.status} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {summary.attention.length > ATTENTION_LIMIT ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("more", { count: summary.attention.length - ATTENTION_LIMIT })}
                  </p>
                ) : null}
              </>
            )}
          </Panel>

          <Panel title={t("fda")}>
            <p className="mb-3 text-sm text-muted-foreground">
              {ops.fdaRenewal.open
                ? t("fdaOpen", { closes: date(ops.fdaRenewal.closesOn) })
                : t("fdaUpcoming", { opens: date(ops.fdaRenewal.opensOn), closes: date(ops.fdaRenewal.closesOn) })}
            </p>
            <p className="mb-2 text-sm font-medium">{t("fdaDue", { count: ops.fdaRenewal.due.length })}</p>
            <PartyList
              items={ops.fdaRenewal.due.map((p) => ({
                key: p.partyId,
                href: supplierLink(p.partyId),
                label: p.partyName,
              }))}
              more={(n) => t("more", { count: n })}
            />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel title={t("suspended")} hint={t("suspendedHint")}>
            <PartyList
              items={ops.suspendedActive.map((p) => ({
                key: p.partyId,
                href: supplierLink(p.partyId),
                label: p.partyName,
                detail: t("materialCount", { count: p.activeSources }),
              }))}
              empty={t("suspendedEmpty")}
              more={(n) => t("more", { count: n })}
            />
          </Panel>
          <Panel title={t("highRisk")} hint={t("highRiskHint")}>
            <PartyList
              items={ops.highRisk.map((p) => ({
                key: p.sourceId,
                href: supplierLink(p.partyId),
                label: p.materialName,
                sub: p.partyName,
                detail: t("gapCount", { count: p.gaps }),
              }))}
              empty={t("highRiskEmpty")}
              more={(n) => t("more", { count: n })}
            />
          </Panel>
          <Panel title={t("fsvp")} hint={t("fsvpHint")}>
            <PartyList
              items={ops.fsvp.map((p) => ({ key: p.partyId, href: supplierLink(p.partyId), label: p.partyName }))}
              empty={t("fsvpEmpty")}
              more={(n) => t("more", { count: n })}
            />
          </Panel>
          <Panel title={t("nonconformities")} hint={t("nonconformitiesHint")}>
            <dl aria-label={t("bySeverity")} className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {SEVERITIES.map((s) => (
                <div key={s} className="flex gap-1.5">
                  <dt className="text-muted-foreground">{tSeverity(s)}</dt>
                  <dd className="font-semibold tabular-nums">{ops.nonconformities.bySeverity[s]}</dd>
                </div>
              ))}
            </dl>
            <PartyList
              items={ops.nonconformities.repeat.map((p) => ({
                key: p.partyId,
                href: supplierLink(p.partyId),
                label: p.partyName,
                detail: t("ncCount", { count: p.count }),
              }))}
              empty={t("nonconformitiesEmpty")}
              more={(n) => t("more", { count: n })}
            />
          </Panel>
        </div>
      </section>

      <section aria-labelledby="kpi-heading" className="grid grid-cols-1 gap-4">
        <SectionHeading id="kpi-heading" title={t("indicators")} hint={t("indicatorsHint")} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-medium text-muted-foreground">{t("compliance")}</p>
            <p className={cn("mt-1 text-4xl font-bold tabular-nums", TONE_TEXT[complianceTone(compliance.percent)])}>
              {compliance.percent}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("complianceHint", { met, total: compliance.total })}
            </p>
          </div>
          <Stat
            icon={Truck}
            label={t("activeSuppliers")}
            value={summary.suppliers.active}
            detail={t("activeHint")}
            href={`${suppliersHref}?estado=active`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title={t("requirements")}>
            <div aria-hidden className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-muted">
              {STATUSES.map((s) => (
                <span
                  key={s}
                  className={SEGMENT[s]}
                  style={{ width: `${(compliance.counts[s] / Math.max(compliance.total, 1)) * 100}%` }}
                />
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <div key={s} className="flex items-center justify-between gap-2">
                  <dt>
                    <StatusPill status={s} />
                  </dt>
                  <dd className="font-semibold tabular-nums">{compliance.counts[s]}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title={t("lowest")}>
            <ul className="grid gap-2.5">
              {lowest.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <Link
                    href={supplierLink(s.id)}
                    className="min-w-0 truncate text-sm font-medium hover:text-primary hover:underline"
                  >
                    {s.name}
                  </Link>
                  <ComplianceBar percent={s.compliance.percent} className="shrink-0" />
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-2 text-sm font-semibold">
              <Link
                href={`${suppliersHref}?pendientes=1`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {t("viewPending")} ({pendingCount})
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <Link href={suppliersHref} className="inline-flex items-center gap-1 text-primary hover:underline">
                {t("viewAll")}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ id, title, hint }: { id: string; title: string; hint: string }) {
  return (
    <div>
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

const LIST_LIMIT = 5;

/** A short list of suppliers (or materials) linking to the supplier page. */
function PartyList({
  items,
  empty,
  more,
}: {
  items: { key: string; href: string; label: string; sub?: string; detail?: string }[];
  empty?: string;
  more: (count: number) => string;
}) {
  if (!items.length) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  return (
    <>
      <ul className="divide-y">
        {items.slice(0, LIST_LIMIT).map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <Link href={item.href} className="block truncate text-sm font-medium hover:text-primary hover:underline">
                {item.label}
              </Link>
              {item.sub ? <p className="truncate text-xs text-muted-foreground">{item.sub}</p> : null}
            </div>
            {item.detail ? (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.detail}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {items.length > LIST_LIMIT ? (
        <p className="mt-2 text-sm text-muted-foreground">{more(items.length - LIST_LIMIT)}</p>
      ) : null}
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  href,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  /** A short line under the number. */
  detail?: string;
  /** Makes the whole tile a link. */
  href?: string;
  className?: string;
}) {
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "group rounded-xl border bg-card p-4 transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          className,
        )}
      >
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground group-hover:text-primary">
          <Icon aria-hidden className="size-4" />
          {label}
          <ArrowRight aria-hidden className="ml-auto size-4" />
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
        {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
      </Link>
    );
  }
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Icon aria-hidden className="size-4" />
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint ? <p className="mb-2 text-sm text-muted-foreground">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}
