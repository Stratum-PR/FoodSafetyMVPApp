import { ArrowLeft, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { documentHref, navHref, supplierHref, uploadHref } from "@/components/app-shell/nav-items";
import { complianceTone } from "@/components/compliance-bar";
import { DocumentStateBadge } from "@/components/documents/document-state-badge";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { StatusPill } from "@/components/status-pill";
import { ApprovalBadge } from "@/components/suppliers/approval-badge";
import { ApprovalSection } from "@/components/suppliers/approval-section";
import { SupplierMatrix } from "@/components/suppliers/supplier-matrix";
import { ComplianceGaps } from "@/components/suppliers/compliance-gaps";
import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import type { RequirementResult, RequirementStatus } from "@/domain/status";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/domain/permissions";
import { isLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { getRequestContext } from "@/server/context";
import type { DocumentView, SourceView } from "@/server/supplier-detail";
import { getSupplier } from "@/server/suppliers";

type Props = PageProps<"/[company]/suplidores/[supplier]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { company, supplier } = await params;
  const detail = await getSupplier(await getRequestContext(company), decodeURIComponent(supplier));
  return { title: detail?.party.name ?? (await getTranslations("supplier"))("notFoundTitle") };
}

const TONE_TEXT = { current: "text-status-current", expiring: "text-status-expiring", missing: "text-status-missing" };
const STATUSES: RequirementStatus[] = ["current", "expiring", "expired", "missing"];
const SEGMENT: Record<RequirementStatus, string> = {
  current: "bg-status-current",
  expiring: "bg-status-expiring",
  expired: "bg-status-missing",
  missing: "bg-status-missing/40",
};

export default async function Page({ params, searchParams }: Props) {
  const [{ company, supplier }, query] = await Promise.all([params, searchParams]);
  const ctx = await getRequestContext(company);
  const [detail, t, tType, tLifecycle, tUpload, format, locale] = await Promise.all([
    getSupplier(ctx, decodeURIComponent(supplier)),
    getTranslations("supplier"),
    getTranslations("partyType"),
    getTranslations("lifecycle"),
    getTranslations("upload"),
    getFormatter(),
    getLocale(),
  ]);
  if (!detail) notFound();

  const lang: Locale = isLocale(locale) ? locale : "es";
  const { party, compliance } = detail;
  const met = compliance.counts.current + compliance.counts.expiring;
  // Noon UTC is the same calendar day in Puerto Rico.
  const date = (iso: string) => (
    <time dateTime={iso}>{format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" })}</time>
  );
  const typeName = (code: string) => findType(DEFAULT_CATALOG, code)?.name[lang] ?? code;
  const requirementName = (r: RequirementResult) => r.requirement.anyOf.map(typeName).join(` ${t("or")} `);
  // Opens the document that currently decides the requirement, where its history is.
  const requirementLink = (r: RequirementResult) =>
    r.document ? (
      <Link href={documentHref(company, r.document.id)} className="text-primary hover:underline">
        {requirementName(r)}
      </Link>
    ) : (
      requirementName(r)
    );
  // A requirement that isn't met may already have a document waiting for review: say so,
  // so nobody asks the supplier again for something already received.
  const awaitingReview = (r: RequirementResult) =>
    r.status !== "current" &&
    detail.documents.some(
      (d) =>
        d.state === "pending_review" &&
        r.requirement.anyOf.includes(d.typeCode) &&
        (d.subject.kind === "party"
          ? r.requirement.subject.kind === "party" && r.requirement.subject.partyId === d.subject.partyId
          : r.requirement.subject.kind === "source" && r.requirement.subject.sourceId === d.subject.sourceId),
    );
  const canUpload = can(ctx.actor.role, "documents.upload");
  const status = (r: RequirementResult) => {
    const waiting = awaitingReview(r);
    const subject = r.requirement.subject;
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusPill status={r.status} />
        {waiting ? <span className="text-xs text-muted-foreground">{t("inReview")}</span> : null}
        {/* Unmet or expiring, and nothing already waiting: offer the upload, pre-filled. */}
        {canUpload && r.status !== "current" && !waiting ? (
          <Link
            href={uploadHref(company, {
              supplier: party.id,
              para: subject.kind === "source" ? subject.sourceId : undefined,
              tipo: r.requirement.anyOf[0],
            })}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {tUpload("short")}
          </Link>
        ) : null}
      </span>
    );
  };
  const expires = (r: RequirementResult) =>
    !r.document ? t("none") : r.expiresOn ? date(r.expiresOn) : t("neverExpires");

  const requirementColumns: Column<RequirementResult>[] = [
    { key: "requirement", header: t("col.requirement"), primary: true, cell: requirementLink },
    { key: "reason", header: t("col.reason"), cell: (r) => t(`reason.${r.requirement.reason}`) },
    { key: "status", header: t("col.status"), cell: status },
    { key: "expires", header: t("col.expires"), cell: expires, className: "tabular-nums" },
  ];

  const documentColumns: Column<DocumentView>[] = [
    {
      key: "type",
      header: t("docCol.type"),
      primary: true,
      cell: (d) => (
        <span>
          <Link href={documentHref(company, d.id)} className="font-semibold text-primary hover:underline">
            {typeName(d.typeCode)}
          </Link>
          {d.lotCode ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">{t("lot", { lot: d.lotCode })}</span>
          ) : null}
        </span>
      ),
    },
    { key: "about", header: t("docCol.about"), cell: (d) => d.materialName ?? t("supplierItself") },
    { key: "received", header: t("docCol.received"), cell: (d) => date(d.receivedOn), className: "tabular-nums" },
    {
      key: "expires",
      header: t("docCol.expires"),
      cell: (d) => (d.expires ? date(d.expires) : t("neverExpires")),
      className: "tabular-nums",
    },
    {
      key: "state",
      header: t("docCol.state"),
      cell: (d) => <DocumentStateBadge state={d.state} />,
    },
    { key: "uploadedBy", header: t("docCol.uploadedBy"), cell: (d) => d.uploadedByName },
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-3 border-b pb-5">
        <Link
          href={navHref(company, "suplidores")}
          className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{party.name}</h1>
          {canUpload ? (
            <Link href={uploadHref(company, { supplier: party.id })} className={buttonVariants({ size: "sm" })}>
              <Upload aria-hidden />
              {tUpload("button")}
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ApprovalBadge approval={party.approval} />
          <Chip>{tLifecycle(party.lifecycle)}</Chip>
          <Chip>{tType(party.type)}</Chip>
          {detail.foreign ? <Chip strong>FSVP</Chip> : null}
        </div>
      </div>

      {query.nuevo === "1" ? (
        <p role="status" className="rounded-lg bg-status-current-bg px-4 py-3 text-sm font-medium text-status-current">
          {t("created")}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">{t("compliance")}</p>
          {compliance.total === 0 ? (
            <>
              <p className="mt-1 text-4xl font-bold text-muted-foreground">—</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("complianceNone")}</p>
            </>
          ) : (
            <>
              <p className={cn("mt-1 text-4xl font-bold tabular-nums", TONE_TEXT[complianceTone(compliance.percent)])}>
                {compliance.percent}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("complianceHint", { met, total: compliance.total })}
              </p>
            </>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{t("complianceExplain")}</p>
          <div aria-hidden className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
            {STATUSES.map((s) => (
              <span
                key={s}
                className={SEGMENT[s]}
                style={{ width: `${(compliance.counts[s] / Math.max(compliance.total, 1)) * 100}%` }}
              />
            ))}
          </div>
          <p className="mt-2">
            <ComplianceGaps summary={compliance} />
          </p>
        </div>
        <dl
          aria-label={t("facts.label")}
          className="grid grid-cols-1 content-start gap-x-6 gap-y-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3"
        >
          <Fact label={t("facts.location")}>{`${party.city}, ${party.country}`}</Fact>
          <Fact label={t("facts.fei")}>{party.fei ?? t("facts.feiNone")}</Fact>
          <Fact label={t("facts.addedBy")}>{detail.createdByName}</Fact>
        </dl>
      </div>

      <ApprovalSection ctx={ctx} partyId={party.id} />

      <Section title={t("partyDocs")} hint={t("partyDocsHint")}>
        {detail.partyRequirements.length ? (
          <ResponsiveTable
            columns={requirementColumns}
            rows={detail.partyRequirements}
            rowKey={(r) => r.requirement.key}
            caption={t("partyDocs")}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("notEvaluated")}</p>
        )}
      </Section>

      <SupplierMatrix
        company={company}
        partyId={party.id}
        sources={detail.sources}
        view={query.vista === "documento" ? "documento" : "ingrediente"}
        incompleteOnly={query.incompletos === "1"}
        canUpload={canUpload}
        pageHref={supplierHref(company, party.id)}
        lang={lang}
      />

      <Section title={t("materials")} hint={t("materialsHint")}>
        {detail.sources.length ? (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {detail.sources.map((s) => (
              <SourceCard key={s.id} source={s} company={company}>
                {s.requirements.length ? (
                  <ul className="mt-3 grid gap-2 border-t pt-3">
                    {s.requirements.map((r) => (
                      <li
                        key={r.requirement.key}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
                      >
                        <span className="text-sm">{requirementLink(r)}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                          {r.document ? expires(r) : null}
                          {status(r)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{t("notEvaluated")}</p>
                )}
              </SourceCard>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noMaterials")}</p>
        )}
      </Section>

      <Section title={t("documents")} hint={t("documentsHint")}>
        {detail.documents.length ? (
          <ResponsiveTable
            columns={documentColumns}
            rows={detail.documents}
            rowKey={(d) => d.id}
            caption={t("documents")}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("noDocuments")}</p>
        )}
      </Section>
    </div>
  );
}

async function SourceCard({
  source: s,
  company,
  children,
}: {
  source: SourceView;
  company: string;
  children: ReactNode;
}) {
  const t = await getTranslations("supplier");
  return (
    <li className="rounded-xl border bg-card p-4" data-source-status={s.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{s.material.name}</p>
          <p className="text-xs text-muted-foreground">
            {s.material.code} · {t(`kind.${s.material.kind}`)} · {t(`risk.${s.risk}`)}
          </p>
        </div>
        <Chip strong={s.status === "active"}>{t(`sourceStatus.${s.status}`)}</Chip>
      </div>
      <p className="mt-2 text-sm">
        <span className="font-medium">{s.role === "manufacturer" ? t("makes") : t("sells")}</span>
        {" · "}
        {s.counterpart ? (
          <>
            {s.role === "manufacturer" ? t("distributedBy") : t("madeBy")}{" "}
            <Link href={supplierHref(company, s.counterpart.id)} className="font-medium text-primary hover:underline">
              {s.counterpart.name}
            </Link>
          </>
        ) : (
          t("direct")
        )}
      </p>
      {children}
    </li>
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}
