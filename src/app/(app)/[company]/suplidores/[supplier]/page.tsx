import { ArrowLeft, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { navHref, SUPPLIER_TABS, type SupplierTab, supplierHref, uploadHref } from "@/components/app-shell/nav-items";
import { ApprovalBadge } from "@/components/suppliers/approval-badge";
import { ApprovalSection, NonconformitySection } from "@/components/suppliers/approval-section";
import { SupplierDocumentsTab } from "@/components/suppliers/supplier-documents-tab";
import { SupplierFacilities } from "@/components/suppliers/supplier-facilities";
import { SupplierHistory } from "@/components/suppliers/supplier-history";
import { SupplierMaterials } from "@/components/suppliers/supplier-materials";
import { SupplierOverview } from "@/components/suppliers/supplier-overview";
import {
  CertificationBadge,
  Fsma204Badge,
  NextActionLink,
  RequirementsSummaryText,
  RiskBadge,
} from "@/components/suppliers/summary-badges";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import { isLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { getRequestContext } from "@/server/context";
import { getSupplier } from "@/server/suppliers";

type Props = PageProps<"/[company]/suplidores/[supplier]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { company, supplier } = await params;
  const detail = await getSupplier(await getRequestContext(company), decodeURIComponent(supplier));
  return { title: detail?.party.name ?? (await getTranslations("supplier"))("notFoundTitle") };
}

/** Which tab: ?tab=… wins; older links to the matrix (?vista=, ?incompletos=) open Materials. */
function tabFrom(query: Record<string, string | string[] | undefined>): SupplierTab {
  const tab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  if ((SUPPLIER_TABS as readonly string[]).includes(tab ?? "")) return tab as SupplierTab;
  return query.vista || query.incompletos ? "materiales" : "resumen";
}

export default async function Page({ params, searchParams }: Props) {
  const [{ company, supplier }, query] = await Promise.all([params, searchParams]);
  const ctx = await getRequestContext(company);
  const [detail, t, tType, tUpload, format, locale] = await Promise.all([
    getSupplier(ctx, decodeURIComponent(supplier)),
    getTranslations("supplier"),
    getTranslations("partyType"),
    getTranslations("upload"),
    getFormatter(),
    getLocale(),
  ]);
  if (!detail) notFound();

  const lang: Locale = isLocale(locale) ? locale : "es";
  const { party, summary } = detail;
  const tab = tabFrom(query);
  // Noon UTC is the same calendar day in Puerto Rico.
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });
  const canUpload = can(ctx.actor.role, "documents.upload");
  // Only sections that exist and this role may see. Requests come with the requests workspace.
  const tabs = SUPPLIER_TABS.filter((k) => k !== "documentos" || can(ctx.actor.role, "documents.view"));
  const current = tabs.includes(tab) ? tab : "resumen";

  return (
    <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-6">
      <div className="grid gap-3">
        <Link
          href={navHref(company, "suplidores")}
          className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-balance break-words sm:text-3xl">{party.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <ApprovalBadge state={summary.state} />
              <Chip>{tType(party.type)}</Chip>
              <Chip>{t(`direction.${party.direction}`)}</Chip>
              {detail.foreign ? <Chip strong>FSVP</Chip> : null}
            </div>
          </div>
          {canUpload ? (
            <Link href={uploadHref(company, { supplier: party.id })} className={buttonVariants({ size: "sm" })}>
              <Upload aria-hidden />
              {tUpload("button")}
            </Link>
          ) : null}
        </div>
      </div>

      {query.nuevo === "1" ? (
        <p role="status" className="rounded-lg bg-status-current-bg px-4 py-3 text-sm font-medium text-status-current">
          {t("created")}
        </p>
      ) : null}

      <dl
        aria-label={t("header.label")}
        className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
      >
        <Tile label={t("header.approval")}>
          <ApprovalBadge state={summary.state} />
          {summary.reviewBy && (summary.state === "approved" || summary.state === "conditional") ? (
            <span className="text-xs text-muted-foreground">
              {t("header.reviewBy", { date: date(summary.reviewBy) })}
            </span>
          ) : null}
        </Tile>
        <Tile label={t("header.risk")}>
          <RiskBadge rating={summary.risk.rating} />
          {summary.risk.assessedOn ? (
            <span className="text-xs text-muted-foreground">
              {t("header.assessedOn", { date: date(summary.risk.assessedOn) })}
            </span>
          ) : null}
        </Tile>
        <Tile label={t("header.requirements")}>
          <RequirementsSummaryText summary={summary.requirements} className="text-left" />
        </Tile>
        <Tile label={t("header.certification")}>
          <CertificationBadge status={summary.certification.status} />
          {summary.certification.required ? (
            <span className="text-xs text-muted-foreground">
              {t("header.sitesVerified", {
                verified: summary.certification.verified,
                required: summary.certification.required,
              })}
            </span>
          ) : null}
        </Tile>
        <Tile label={t("header.fsma204")}>
          <Fsma204Badge status={summary.fsma204.status} />
        </Tile>
        <Tile label={t("header.issues")}>
          <span className="text-2xl font-bold tabular-nums">{summary.issues.open}</span>
          <span className="text-xs text-muted-foreground">
            {t("header.issuesHint", { serious: summary.issues.serious })}
          </span>
        </Tile>
      </dl>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/30 bg-secondary/30 px-4 py-3">
        <span className="text-sm font-medium">{t("header.nextAction")}</span>
        <NextActionLink company={company} summary={summary} dateText={date} />
      </div>

      <nav aria-label={t("tabs.label")} className="-mx-1 overflow-x-auto border-b">
        <ul className="flex min-w-max gap-1 px-1">
          {tabs.map((k) => (
            <li key={k}>
              <Link
                href={supplierHref(company, party.id, { tab: k })}
                scroll={false}
                aria-current={k === current ? "page" : undefined}
                className={cn(
                  "inline-flex items-center border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  k === current
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`tabs.${k}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {current === "resumen" ? (
        <>
          <SupplierOverview company={company} detail={detail} ctx={ctx} />
          <ApprovalSection ctx={ctx} partyId={party.id} />
        </>
      ) : null}
      {current === "instalaciones" ? (
        <SupplierFacilities company={company} detail={detail} canUpload={canUpload} />
      ) : null}
      {current === "materiales" ? (
        <SupplierMaterials
          company={company}
          detail={detail}
          canUpload={canUpload}
          view={query.vista === "documento" ? "documento" : "ingrediente"}
          incompleteOnly={query.incompletos === "1"}
          lang={lang}
        />
      ) : null}
      {current === "documentos" ? (
        <SupplierDocumentsTab company={company} detail={detail} canUpload={canUpload} />
      ) : null}
      {current === "incidencias" ? <NonconformitySection ctx={ctx} partyId={party.id} /> : null}
      {current === "historial" ? <SupplierHistory ctx={ctx} detail={detail} /> : null}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5 rounded-xl border bg-card p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="grid justify-items-start gap-1">{children}</dd>
    </div>
  );
}

function Chip({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        strong ? "border-transparent bg-secondary text-secondary-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
