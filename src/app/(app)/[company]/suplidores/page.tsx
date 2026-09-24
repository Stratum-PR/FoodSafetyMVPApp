import { SearchX } from "lucide-react";
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
import { SupplierFiltersForm } from "@/components/suppliers/supplier-filters-form";
import { getRequestContext } from "@/server/context";
import {
  filtersQuery,
  filterSuppliers,
  hasFilters,
  parseFilters,
  type SortKey,
  sortSuppliers,
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
  const action = navHref(company, "suplidores");

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
          <Link href={supplierHref(company, r.id)} className="font-semibold text-primary hover:underline">
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
      <PageHeader title={text.title} description={text.description} />
      <SupplierFiltersForm
        key={JSON.stringify(filters)}
        action={action}
        filters={filters}
        filtered={hasFilters(filters)}
        clearHref={`${action}${filtersQuery({ ...parseFilters({}), sort: filters.sort, dir: filters.dir })}`}
      />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("count", { shown: shown.length, total: rows.length })}
      </p>
      {shown.length ? (
        <ResponsiveTable columns={columns} rows={shown} rowKey={(r) => r.id} caption={t("caption")} />
      ) : (
        <EmptyState icon={SearchX} title={t("emptyTitle")} body={t("emptyBody")} />
      )}
    </div>
  );
}
