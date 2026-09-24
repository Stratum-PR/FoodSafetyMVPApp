import { FileCheck2, Search, SearchX, Upload } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { documentHref, navHref, supplierHref, uploadHref } from "@/components/app-shell/nav-items";
import { DocumentStateBadge } from "@/components/documents/document-state-badge";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { sectionText } from "@/components/section-placeholder";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import { can } from "@/domain/permissions";
import { isLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { getRequestContext } from "@/server/context";
import {
  DOCUMENT_TABS,
  type DocumentRow,
  documentsQuery,
  filterDocuments,
  parseDocumentFilters,
  tabCounts,
} from "@/server/document-list";
import { listDocuments } from "@/server/documents";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await sectionText("documents")).title };
}

export default async function Page({ params, searchParams }: PageProps<"/[company]/documentos">) {
  const [{ company }, query] = await Promise.all([params, searchParams]);
  const ctx = await getRequestContext(company);
  const [rows, text, t, tUpload, format, locale] = await Promise.all([
    listDocuments(ctx),
    sectionText("documents"),
    getTranslations("documents"),
    getTranslations("upload"),
    getFormatter(),
    getLocale(),
  ]);
  const lang = isLocale(locale) ? locale : "es";
  const filters = parseDocumentFilters(query);
  const counts = tabCounts(rows);
  const shown = filterDocuments(rows, filters);
  const action = navHref(company, "documentos");
  // Noon UTC is the same calendar day in Puerto Rico.
  const date = (iso: string) => (
    <time dateTime={iso}>{format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" })}</time>
  );

  const columns: Column<DocumentRow>[] = [
    {
      key: "type",
      header: t("col.type"),
      primary: true,
      cell: (r) => (
        <span>
          <Link href={documentHref(company, r.id)} className="font-semibold text-primary hover:underline">
            {findType(DEFAULT_CATALOG, r.typeCode)?.name[lang] ?? r.typeCode}
          </Link>
          {r.lotCode ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">{t("lot", { lot: r.lotCode })}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "supplier",
      header: t("col.supplier"),
      cell: (r) => (
        <Link href={supplierHref(company, r.partyId)} className="hover:text-primary hover:underline">
          {r.partyName}
        </Link>
      ),
    },
    { key: "about", header: t("col.about"), cell: (r) => r.materialName ?? t("supplierItself") },
    { key: "received", header: t("col.received"), cell: (r) => date(r.receivedOn), className: "tabular-nums" },
    {
      key: "expires",
      header: t("col.expires"),
      cell: (r) => (r.expires ? date(r.expires) : t("neverExpires")),
      className: "tabular-nums",
    },
    {
      key: "uploadedBy",
      header: t("col.uploadedBy"),
      // Marks your own uploads (companies can require someone else to review them).
      cell: (r) => (r.uploadedBy === ctx.actor.userId ? `${r.uploadedByName} (${t("yours")})` : r.uploadedByName),
    },
    { key: "state", header: t("col.state"), cell: (r) => <DocumentStateBadge state={r.state} /> },
  ];

  const queue = filters.tab === "revisar";
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title={text.title}
        description={text.description}
        actions={
          can(ctx.actor.role, "documents.upload") ? (
            <Link href={uploadHref(company)} className={buttonVariants()}>
              <Upload aria-hidden />
              {tUpload("button")}
            </Link>
          ) : null
        }
      />

      <nav aria-label={t("tabsLabel")} className="overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b">
          {DOCUMENT_TABS.map((tab) => {
            const active = tab === filters.tab;
            return (
              <li key={tab}>
                <Link
                  href={`${action}${documentsQuery({ tab, q: filters.q })}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`tabs.${tab}`)}
                  <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{counts[tab]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Form action={action} className="flex flex-wrap items-end gap-2">
        {filters.tab !== "revisar" ? <input type="hidden" name="estado" value={filters.tab} /> : null}
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="d-q">{t("search")}</Label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="d-q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder={t("searchPlaceholder")}
              className="pl-8"
            />
          </div>
        </div>
        <Button type="submit" size="sm" variant="outline">
          {t("search")}
        </Button>
      </Form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("count", { count: shown.length })}
        {queue && shown.length ? ` · ${t("queueHint")}` : ""}
      </p>

      {shown.length ? (
        <ResponsiveTable columns={columns} rows={shown} rowKey={(r) => r.id} caption={t("caption")} />
      ) : filters.q ? (
        <EmptyState icon={SearchX} title={t("emptySearch")} />
      ) : (
        <EmptyState
          icon={FileCheck2}
          title={queue ? t("emptyQueue") : t("empty")}
          body={queue ? t("emptyQueueBody") : undefined}
        />
      )}
    </div>
  );
}
