import { ArrowRight, Factory, FileWarning, type LucideIcon, Plus, SearchX, Truck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { navHref, supplierHref } from "@/components/app-shell/nav-items";
import { ComplianceBar } from "@/components/compliance-bar";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { sectionText } from "@/components/section-placeholder";
import { ApprovalBadge } from "@/components/suppliers/approval-badge";
import { ComplianceGaps } from "@/components/suppliers/compliance-gaps";
import { SupplierToolbar } from "@/components/suppliers/supplier-toolbar";
import { buttonVariants } from "@/components/ui/button";
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
  const [rows, text, t, tType] = await Promise.all([
    listSuppliers(ctx),
    sectionText("suppliers"),
    getTranslations("suppliers"),
    getTranslations("partyType"),
  ]);
  const filters = parseFilters(query);
  const shown = sortSuppliers(filterSuppliers(rows, filters), filters.sort, filters.dir);
  const current = paginate(shown, filters.page);
  const stats = supplierStats(rows);
  const action = navHref(company, "suplidores");
  const hrefWith = (change: Partial<SupplierFilters>) => `${action}${filtersQuery({ ...filters, page: 1, ...change })}`;

  // Every column sorts; clicking the current one flips the direction. Filters are kept.
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
      cell: (r) => (
        <div className="min-w-0">
          <Link href={supplierHref(company, r.id)} className="relative font-semibold text-primary hover:underline">
            {r.name}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-muted-foreground">
            <span>{r.country === "PR" ? r.city : `${r.city} · ${r.country}`}</span>
            {r.foreign ? (
              <span className="rounded bg-secondary px-1.5 py-0.5 font-semibold text-secondary-foreground">
                {t("foreign")}
              </span>
            ) : null}
            {r.lifecycle === "inactive" ? (
              <span className="rounded border px-1.5 py-0.5 font-semibold">{t("inactive")}</span>
            ) : null}
          </div>
        </div>
      ),
    },
    { key: "type", header: t("col.type"), sort: sort("type"), cell: (r) => tType(r.type) },
    {
      key: "approval",
      header: t("col.approval"),
      sort: sort("approval"),
      cell: (r) => <ApprovalBadge approval={r.approval} />,
    },
    {
      key: "sources",
      header: t("col.sources"),
      sort: sort("sources"),
      cell: (r) => r.activeSources,
      className: "tabular-nums",
    },
    {
      key: "compliance",
      header: t("col.compliance"),
      sort: sort("compliance"),
      cell: (r) => (
        <div className="inline-flex flex-col items-end gap-0.5 md:items-start">
          <ComplianceBar percent={r.compliance.percent} />
          <ComplianceGaps summary={r.compliance} />
        </div>
      ),
    },
  ];

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

      <p className="-mb-3 text-sm text-muted-foreground" aria-live="polite">
        {t("count", { shown: shown.length, total: rows.length })}
      </p>
      {shown.length ? (
        <div className="grid gap-3">
          <ResponsiveTable
            columns={columns}
            rows={current.rows}
            rowKey={(r) => r.id}
            rowHref={(r) => supplierHref(company, r.id)}
            caption={t("caption")}
          />
          {current.pages > 1 ? (
            <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
              <PageLink href={hrefWith({ page: current.page - 1 })} disabled={current.page === 1}>
                {t("previous")}
              </PageLink>
              <p className="text-sm text-muted-foreground" aria-current="page">
                {t("page", { page: current.page, pages: current.pages })}
              </p>
              <PageLink href={hrefWith({ page: current.page + 1 })} disabled={current.page === current.pages}>
                {t("next")}
              </PageLink>
            </nav>
          ) : null}
        </div>
      ) : (
        <EmptyState icon={SearchX} title={t("emptyTitle")} body={t("emptyBody")} />
      )}
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

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: string }) {
  if (disabled) {
    return (
      <span
        aria-disabled
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")}
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {children}
    </Link>
  );
}
