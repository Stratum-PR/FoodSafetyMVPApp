import { FileCheck2, ListChecks, Search, SearchX, Send, Upload } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { documentHref, navHref, supplierHref, uploadHref } from "@/components/app-shell/nav-items";
import { DocumentStateBadge } from "@/components/documents/document-state-badge";
import { PriorityBadge } from "@/components/documents/priority-badge";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { newRequestHref, requestHref } from "@/components/requests/hrefs";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { sectionText } from "@/components/section-placeholder";
import { StatusPill } from "@/components/status-pill";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import { can } from "@/domain/permissions";
import { findProgram, type ProgramCode, PROGRAMS, type RequirementCode } from "@/domain/programs";
import { isLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { getRequestContext } from "@/server/context";
import {
  DOCUMENT_TABS,
  type DocumentRow,
  documentsQuery,
  EXPIRY_WINDOWS,
  filterDocuments,
  type GapRow,
  LIFECYCLES,
  paginate,
  parseDocumentFilters,
  PRIORITIES,
  SORTS,
  tabCounts,
  VIAS,
} from "@/server/document-list";
import { listDocuments, listEvidenceGaps } from "@/server/documents";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await sectionText("documents")).title };
}

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
const TAB =
  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
const WRAP = "min-w-32 whitespace-normal";
const tabTone = (active: boolean) =>
  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground";

/**
 * /{company}/documentos: the review workspace. Tabs are review states (Por revisar is the
 * default queue); replaced versions are a filter of Aceptados; ?vista=faltantes shows the
 * evidence gaps, which come from obligations and are never listed as documents.
 */
export default async function Page({ params, searchParams }: PageProps<"/[company]/documentos">) {
  const [{ company }, query] = await Promise.all([params, searchParams]);
  const ctx = await getRequestContext(company);
  const [text, t, tUpload, tRequests, tPriority, tReq, format, locale] = await Promise.all([
    sectionText("documents"),
    getTranslations("documents"),
    getTranslations("upload"),
    getTranslations("requests"),
    getTranslations("priority"),
    getTranslations("requirements.name"),
    getFormatter(),
    getLocale(),
  ]);
  const lang = isLocale(locale) ? locale : "es";
  const gapsView = query.vista === "faltantes";
  const action = navHref(company, "documentos");
  const date = (iso: string) => (
    <time dateTime={iso}>{format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" })}</time>
  );
  const requirementName = (code: RequirementCode) => tReq(code);
  const programName = (code: ProgramCode) => findProgram(code).name[lang];
  const canRequest = can(ctx.actor.role, "requests.send");
  const canUpload = can(ctx.actor.role, "documents.upload");

  const rows = await listDocuments(ctx);
  const counts = tabCounts(rows);
  const filters = parseDocumentFilters(query);

  const header = (
    <PageHeader
      title={text.title}
      description={text.description}
      actions={
        <>
          {canRequest ? (
            <Link href={newRequestHref(company)} className={buttonVariants({ variant: "outline" })}>
              <Send aria-hidden />
              {tRequests("new")}
            </Link>
          ) : null}
          {canUpload ? (
            <Link href={uploadHref(company)} className={buttonVariants()}>
              <Upload aria-hidden />
              {tUpload("button")}
            </Link>
          ) : null}
        </>
      }
    />
  );

  const tabs = (
    <nav aria-label={t("tabsLabel")} className="overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b">
        {DOCUMENT_TABS.map((tab) => {
          const active = !gapsView && tab === filters.tab;
          return (
            <li key={tab}>
              <Link
                href={`${action}${documentsQuery({ tab })}`}
                aria-current={active ? "page" : undefined}
                className={cn(TAB, tabTone(active))}
              >
                {t(`tabs.${tab}`)}
                <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{counts[tab]}</span>
              </Link>
            </li>
          );
        })}
        <li className="ml-auto">
          <Link
            href={`${action}?vista=faltantes`}
            aria-current={gapsView ? "page" : undefined}
            className={cn(TAB, tabTone(gapsView))}
          >
            <ListChecks aria-hidden className="size-4" />
            {t("gapsTab")}
          </Link>
        </li>
      </ul>
    </nav>
  );

  if (gapsView) {
    return (
      <div className="grid grid-cols-1 gap-6">
        {header}
        {tabs}
        <GapsView
          company={company}
          gaps={await listEvidenceGaps(ctx)}
          canRequest={canRequest}
          canUpload={canUpload}
          requirementName={requirementName}
          programName={programName}
        />
      </div>
    );
  }

  const shown = filterDocuments(rows, filters, ctx.today);
  const page = paginate(shown, filters.page);
  const queue = filters.tab === "revisar";

  const columns: Column<DocumentRow>[] = [
    {
      key: "document",
      className: WRAP,
      header: t("col.document"),
      primary: true,
      cell: (r) => (
        <span className="grid gap-0.5">
          <Link href={documentHref(company, r.id)} className="font-semibold text-primary hover:underline">
            {findType(DEFAULT_CATALOG, r.typeCode)?.name[lang] ?? r.typeCode}
          </Link>
          <span className="text-xs font-normal break-all text-muted-foreground">
            {[
              r.fileName ?? t("noFile"),
              t("version", { version: r.version }),
              r.lotCode ? t("lot", { lot: r.lotCode }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      ),
    },
    {
      key: "from",
      className: WRAP,
      header: t("col.from"),
      cell: (r) => (
        <span className="grid gap-0.5">
          <Link href={supplierHref(company, r.partyId)} className="hover:text-primary hover:underline">
            {r.partyName}
          </Link>
          {r.site ? <span className="text-xs text-muted-foreground">{r.site}</span> : null}
        </span>
      ),
    },
    {
      key: "appliesTo",
      className: WRAP,
      header: t("col.appliesTo"),
      cell: (r) => r.materialName ?? (r.subjectKind === "site" && r.site ? r.site : t("company")),
    },
    {
      key: "requirement",
      className: WRAP,
      header: t("col.requirement"),
      cell: (r) =>
        r.requirements.length ? (
          <span className="grid gap-0.5">
            <span>{r.requirements.map((x) => requirementName(x.code)).join(", ")}</span>
            <span className="text-xs text-muted-foreground">
              {[...new Set(r.requirements.map((x) => programName(x.program)))].join(", ")} ·{" "}
              {t("obligations", { count: r.obligationCount })}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">{t("noRequirement")}</span>
        ),
    },
    {
      key: "received",
      header: t("col.received"),
      cell: (r) => (
        <span className="grid gap-0.5">
          {date(r.receivedOn)}
          <span className="text-xs text-muted-foreground">
            {r.receivedVia === "portal" && r.requestId ? (
              <Link href={requestHref(company, r.requestId)} className="hover:text-primary hover:underline">
                {t("viaPortal", { name: r.uploadedByName })}
              </Link>
            ) : (
              t("viaTeam", {
                name: r.uploadedBy === ctx.actor.userId ? `${r.uploadedByName} (${t("yours")})` : r.uploadedByName,
              })
            )}
          </span>
        </span>
      ),
      className: `${WRAP} tabular-nums`,
    },
    {
      key: "validThrough",
      header: t("col.validThrough"),
      cell: (r) => (r.expires ? date(r.expires) : t("neverExpires")),
      className: "tabular-nums",
    },
    {
      key: "state",
      header: queue ? `${t("col.state")} · ${t("col.priority")}` : t("col.state"),
      cell: (r) => (
        <span className="inline-flex flex-col items-end gap-1 md:items-start">
          <DocumentStateBadge state={r.state} />
          {queue ? <PriorityBadge priority={r.priority} /> : null}
        </span>
      ),
    },
    {
      key: "action",
      header: t("col.action"),
      cell: (r) => (
        <Link
          href={documentHref(company, r.id)}
          className={buttonVariants({ size: "sm", variant: r.state === "pending_review" ? "default" : "outline" })}
        >
          {r.state === "pending_review" ? t("review") : t("view")}
        </Link>
      ),
    },
  ];

  const parties = [...new Map(rows.map((r) => [r.partyId, r.partyName])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1], "es"),
  );
  const materials = [...new Set(rows.map((r) => r.materialName).filter((m): m is string => Boolean(m)))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
  const cleared = { tab: filters.tab, sort: filters.sort };
  const filtered = documentsQuery({ ...filters, page: 1 }) !== documentsQuery(cleared);
  const pageHref = (n: number) => `${action}${documentsQuery({ ...filters, page: n })}`;

  return (
    <div className="grid grid-cols-1 gap-6">
      {header}
      {tabs}

      <Form action={action} className="grid gap-3 rounded-xl border bg-card p-4" aria-label={t("filtersTitle")}>
        {filters.tab !== "revisar" ? <input type="hidden" name="estado" value={filters.tab} /> : null}
        <div className="grid gap-1.5">
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select id="d-party" name="suplidor" label={t("filter.party")} value={filters.party} any={t("any")}>
            {parties.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
          <Select id="d-material" name="material" label={t("filter.material")} value={filters.material} any={t("any")}>
            {materials.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Select id="d-type" name="tipo" label={t("filter.type")} value={filters.type} any={t("any")}>
            {DEFAULT_CATALOG.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name[lang]}
              </option>
            ))}
          </Select>
          <Select id="d-program" name="programa" label={t("filter.program")} value={filters.program} any={t("any")}>
            {PROGRAMS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name[lang]}
              </option>
            ))}
          </Select>
          <Select id="d-via" name="origen" label={t("filter.via")} value={filters.via} any={t("any")}>
            {VIAS.map((v) => (
              <option key={v} value={v}>
                {t(`via.${v}`)}
              </option>
            ))}
          </Select>
          <Select id="d-priority" name="prioridad" label={t("filter.priority")} value={filters.priority} any={t("any")}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {tPriority(p)}
              </option>
            ))}
          </Select>
          <Select id="d-expiry" name="vence" label={t("filter.expiry")} value={filters.expiry} any={t("any")}>
            {EXPIRY_WINDOWS.map((w) => (
              <option key={w} value={w}>
                {t(`expiry.${w}`)}
              </option>
            ))}
          </Select>
          {filters.tab === "aceptados" ? (
            <Select id="d-lifecycle" name="ciclo" label={t("filter.lifecycle")} value={filters.lifecycle}>
              {LIFECYCLES.map((l) => (
                <option key={l} value={l}>
                  {t(`lifecycle.${l}`)}
                </option>
              ))}
            </Select>
          ) : null}
          <Select id="d-sort" name="orden" label={t("filter.sort")} value={filters.sort}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm">
            {t("apply")}
          </Button>
          {filtered ? (
            <Link
              href={`${action}${documentsQuery({ tab: filters.tab })}`}
              className="text-sm font-semibold text-primary hover:underline"
            >
              {t("clear")}
            </Link>
          ) : null}
        </div>
      </Form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("count", { count: shown.length })}
        {queue && shown.length ? ` · ${t("queueHint")}` : ""}
      </p>

      {page.rows.length ? (
        <>
          <ResponsiveTable columns={columns} rows={page.rows} rowKey={(r) => r.id} caption={t("caption")} />
          {page.pages > 1 ? (
            <nav aria-label={t("page.label")} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{t("page.of", { page: page.page, pages: page.pages })}</span>
              <span className="flex gap-2">
                {page.page > 1 ? (
                  <Link href={pageHref(page.page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {t("page.prev")}
                  </Link>
                ) : null}
                {page.page < page.pages ? (
                  <Link href={pageHref(page.page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {t("page.next")}
                  </Link>
                ) : null}
              </span>
            </nav>
          ) : null}
        </>
      ) : filtered ? (
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

function Select({
  id,
  name,
  label,
  value,
  any,
  children,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  /** Label of the "no filter" option; left out for selects that always have a value. */
  any?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} defaultValue={value} className={SELECT}>
        {any !== undefined ? <option value="">{any}</option> : null}
        {children}
      </select>
    </div>
  );
}

async function GapsView({
  company,
  gaps,
  canRequest,
  canUpload,
  requirementName,
  programName,
}: {
  company: string;
  gaps: GapRow[];
  canRequest: boolean;
  canUpload: boolean;
  requirementName: (code: RequirementCode) => string;
  programName: (code: ProgramCode) => string;
}) {
  const t = await getTranslations("documents");
  const columns: Column<GapRow>[] = [
    {
      key: "requirement",
      className: WRAP,
      header: t("gaps.col.requirement"),
      primary: true,
      cell: (g) => (
        <span className="grid gap-0.5">
          <span className="font-semibold">{requirementName(g.code)}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {programName(g.program)} · {t("gaps.materials", { count: g.sourceCount })}
            {g.blocking ? ` · ${t("gaps.blocking")}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "from",
      className: WRAP,
      header: t("gaps.col.from"),
      cell: (g) => (
        <span className="grid gap-0.5">
          <Link href={supplierHref(company, g.partyId)} className="hover:text-primary hover:underline">
            {g.partyName}
          </Link>
          {g.site ? <span className="text-xs text-muted-foreground">{g.site}</span> : null}
        </span>
      ),
    },
    {
      key: "appliesTo",
      className: WRAP,
      header: t("gaps.col.appliesTo"),
      cell: (g) => g.materialName ?? g.site ?? t("company"),
    },
    { key: "status", header: t("gaps.col.status"), cell: (g) => <StatusPill status={g.status} /> },
    {
      key: "action",
      header: t("gaps.col.action"),
      cell: (g) => (
        <span className="flex flex-wrap justify-end gap-2 md:justify-start">
          {g.requestId ? (
            <Link
              href={requestHref(company, g.requestId)}
              className="text-sm font-semibold text-primary hover:underline"
            >
              {t("gaps.requested")}
            </Link>
          ) : canRequest && g.status !== "awaiting_review" ? (
            <Link
              href={newRequestHref(company, { supplier: g.partyId, keys: [g.key] })}
              className={buttonVariants({ size: "sm" })}
            >
              {t("gaps.request")}
            </Link>
          ) : null}
          {canUpload && g.status !== "awaiting_review" ? (
            <Link
              href={uploadHref(company, {
                supplier: g.partyId,
                para:
                  g.subject.kind === "site"
                    ? g.subject.siteId
                    : g.subject.kind === "source"
                      ? g.subject.sourceId
                      : undefined,
              })}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              {t("gaps.upload")}
            </Link>
          ) : null}
        </span>
      ),
    },
  ];
  return (
    <section aria-labelledby="gaps-title" className="grid gap-3">
      <div>
        <h2 id="gaps-title" className="text-lg font-semibold">
          {t("gaps.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("gaps.hint")}</p>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("gaps.count", { count: gaps.length })}
      </p>
      {gaps.length ? (
        <ResponsiveTable columns={columns} rows={gaps} rowKey={(g) => g.key} caption={t("gaps.caption")} />
      ) : (
        <EmptyState icon={FileCheck2} title={t("gaps.empty")} body={t("gaps.emptyBody")} />
      )}
    </section>
  );
}
