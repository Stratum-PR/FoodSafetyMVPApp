import { ArrowRight, Factory, FileWarning, type LucideIcon, Plus, SearchX, Truck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { navHref, supplierHref } from "@/components/app-shell/nav-items";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { sectionText } from "@/components/section-placeholder";
import { ApprovalBadge } from "@/components/suppliers/approval-badge";
import {
  CertificationBadge,
  Fsma204Badge,
  NextActionLink,
  RequirementsSummaryText,
  RiskBadge,
} from "@/components/suppliers/summary-badges";
import { buttonVariants } from "@/components/ui/button";
import { SupplierToolbar } from "@/components/suppliers/supplier-toolbar";
import { can } from "@/domain/permissions";
import { cn } from "@/lib/utils";
import { getRequestContext } from "@/server/context";
import {
  filtersQuery,
  filterSuppliers,
  paginate,
  parseFilters,
  type SortKey,
  type SupplierFilters,
  sortSuppliers,
  supplierStats,
  withSort,
} from "@/server/supplier-filters";
import { listSuppliers, type SupplierRow } from "@/server/suppliers";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await sectionText("suppliers")).title };
}

export default async function Page({ params, searchParams }: PageProps<"/[company]/suplidores">) {
  const [{ company }, query] = await Promise.all([params, searchParams]);
  const ctx = await getRequestContext(company);
  const [rows, text, t, tType, format] = await Promise.all([
    listSuppliers(ctx),
    sectionText("suppliers"),
    getTranslations("suppliers"),
    getTranslations("partyType"),
    getFormatter(),
  ]);
  const filters = parseFilters(query);
  const matching = sortSuppliers(filterSuppliers(rows, filters), filters.sort, filters.dir);
  const page = paginate(matching, filters.page);
  const action = navHref(company, "suplidores");
  // Noon UTC is the same calendar day in Puerto Rico.
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });
  const stats = supplierStats(rows);
  const hrefWith = (change: Partial<SupplierFilters>) => `${action}${filtersQuery({ ...filters, page: 1, ...change })}`;

  // Sortable columns; clicking the current one flips the direction. Filters are kept.
  const sort = (key: SortKey) => ({
    href: `${action}${filtersQuery(withSort(filters, key))}`,
    dir: filters.sort === key ? filters.dir : null,
  });

  const columns: Column<SupplierRow>[] = [
    {
      key: "name",
      header: t("col.name"),
      primary: true,
      sort: sort("name"),
      className: "min-w-48",
      cell: (r) => (
        <div className="min-w-0">
          <Link href={supplierHref(company, r.id)} className="font-semibold break-words text-primary hover:underline">
            {r.name}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-muted-foreground">
            <span>{r.country === "PR" ? r.city : `${r.city} · ${r.country}`}</span>
            <span>{tType(r.type)}</span>
            {r.foreign ? (
              <span className="rounded bg-secondary px-1.5 py-0.5 font-semibold text-secondary-foreground">
                {t("foreign")}
              </span>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "approval",
      header: t("col.approval"),
      sort: sort("approval"),
      cell: (r) => (
        <span className="inline-grid justify-items-end gap-0.5 md:justify-items-start">
          <ApprovalBadge state={r.summary.state} />
          {r.summary.reviewBy && ["approved", "conditional"].includes(r.summary.state) ? (
            <span className="text-xs text-muted-foreground">{t("reviewBy", { date: date(r.summary.reviewBy) })}</span>
          ) : r.summary.decidedOn ? (
            <span className="text-xs text-muted-foreground">{t("decidedOn", { date: date(r.summary.decidedOn) })}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "risk",
      header: t("col.risk"),
      sort: sort("risk"),
      cell: (r) => <RiskBadge rating={r.summary.risk.rating} />,
    },
    {
      key: "materials",
      header: t("col.materials"),
      sort: sort("materials"),
      cell: (r) => (
        <span className="inline-grid justify-items-end gap-0.5 md:justify-items-start">
          <Link
            href={supplierHref(company, r.id, { tab: "materiales" })}
            className="text-sm font-semibold text-primary tabular-nums hover:underline"
          >
            {t("materialsActive", { count: r.summary.materials.active })}
          </Link>
          {r.summary.materials.active ? (
            <span className="text-xs text-muted-foreground">
              {t("materialsQualified", {
                qualified: r.summary.materials.qualified,
                notAssessed: r.summary.materials.notAssessed,
              })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "certification",
      header: t("col.certification"),
      cell: (r) => (
        <span className="inline-grid justify-items-end gap-0.5 md:justify-items-start">
          <CertificationBadge status={r.summary.certification.status} />
          {r.summary.certification.required ? (
            <span className="text-xs text-muted-foreground">
              {t("sitesVerified", {
                verified: r.summary.certification.verified,
                required: r.summary.certification.required,
              })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "requirements",
      header: t("col.requirements"),
      sort: sort("requirements"),
      cell: (r) => <RequirementsSummaryText summary={r.summary.requirements} />,
    },
    { key: "fsma204", header: t("col.fsma204"), cell: (r) => <Fsma204Badge status={r.summary.fsma204.status} /> },
    {
      key: "issues",
      header: t("col.issues"),
      sort: sort("issues"),
      className: "tabular-nums",
      cell: (r) =>
        r.summary.issues.open ? (
          <Link
            href={supplierHref(company, r.id, { tab: "incidencias" })}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {t("issuesOpen", { count: r.summary.issues.open })}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">{t("issuesNone")}</span>
        ),
    },
    {
      key: "next",
      header: t("col.nextAction"),
      className: "min-w-40",
      cell: (r) => <NextActionLink company={company} summary={r.summary} dateText={date} />,
    },
  ];

  const pageHref = (n: number) => `${action}${filtersQuery({ ...filters, page: n })}`;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title={text.title}
        description={text.description}
        actions={
          can(ctx.actor.role, "suppliers.edit") ? (
            <Link href={`${action}/nuevo`} className={buttonVariants()}>
              <Plus aria-hidden />
              {t("add")}
            </Link>
          ) : null
        }
      />

      <nav aria-label={t("statsLabel")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label={t("stats.all")}
          value={stats.total}
          detail={t("stats.active", { count: stats.active })}
          href={hrefWith({ type: "all", attention: false })}
          current={filters.type === "all" && !filters.attention}
        />
        <StatCard
          icon={Factory}
          label={t("stats.manufacturers")}
          value={stats.manufacturers.total}
          detail={t("stats.active", { count: stats.manufacturers.active })}
          href={hrefWith({ type: "manufacturer", attention: false })}
          current={filters.type === "manufacturer" && !filters.attention}
        />
        <StatCard
          icon={Truck}
          label={t("stats.distributors")}
          value={stats.distributors.total}
          detail={t("stats.active", { count: stats.distributors.active })}
          href={hrefWith({ type: "distributor", attention: false })}
          current={filters.type === "distributor" && !filters.attention}
        />
        <StatCard
          icon={FileWarning}
          label={t("stats.attention")}
          value={stats.attention}
          detail={t("stats.attentionHint")}
          href={hrefWith({ type: "all", attention: true })}
          current={filters.attention && filters.type === "all"}
        />
      </nav>

      <SupplierToolbar action={action} filters={filters} />

      <p className="text-xs text-muted-foreground">{t("requirementsHint")}</p>
      <p className="-mb-3 text-sm text-muted-foreground" aria-live="polite">
        {t("count", { shown: matching.length, total: rows.length })}
      </p>
      {matching.length ? (
        <div className="grid min-w-0 gap-3">
          <ResponsiveTable
            columns={columns}
            rows={page.rows}
            rowKey={(r) => r.id}
            rowHref={(r) => supplierHref(company, r.id)}
            caption={t("caption")}
          />
        </div>
      ) : (
        <EmptyState icon={SearchX} title={t("emptyTitle")} body={t("emptyBody")} />
      )}
      {page.pages > 1 ? (
        <nav aria-label={t("pagination")} className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={pageHref(page.page - 1)}
            aria-disabled={page.page === 1}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              page.page === 1 && "pointer-events-none opacity-50",
            )}
            tabIndex={page.page === 1 ? -1 : undefined}
          >
            {t("previous")}
          </Link>
          <span className="text-sm text-muted-foreground" aria-current="page">
            {t("pageOf", { page: page.page, pages: page.pages })}
          </span>
          <Link
            href={pageHref(page.page + 1)}
            aria-disabled={page.page === page.pages}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              page.page === page.pages && "pointer-events-none opacity-50",
            )}
            tabIndex={page.page === page.pages ? -1 : undefined}
          >
            {t("next")}
          </Link>
        </nav>
      ) : null}
    </div>
  );
}

/** A count that also filters the list. The one matching the current filter is marked. */
function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  href,
  current,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  detail: string;
  href: string;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={current ? "true" : undefined}
      className={cn(
        "group rounded-xl border bg-card p-4 transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        current && "border-primary bg-primary/5 ring-1 ring-primary",
      )}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground group-hover:text-primary">
        <Icon aria-hidden className="size-4" />
        {label}
        <ArrowRight aria-hidden className="ml-auto size-4 opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </Link>
  );
}
