import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { documentHref, obligationAnchor, uploadHref } from "@/components/app-shell/nav-items";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { StatusPill } from "@/components/status-pill";
import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import type { Obligation } from "@/domain/obligations";
import { findProgram } from "@/domain/programs";
import { isLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { SupplierDetail } from "@/server/supplier-detail";

const SEVERITY_TONE = {
  critical: "text-status-missing",
  major: "text-status-expiring",
  minor: "text-muted-foreground",
} as const;

/**
 * Obligations as a table: requirement, program, scope, why it applies, priority, status, dates
 * and the action. Each row links to the evidence that decides it, or to the upload form already
 * filled in when nothing valid is on file. A missing row is an obligation, never a fake document.
 */
export async function ObligationTable({
  company,
  detail,
  obligations,
  canUpload,
  caption,
}: {
  company: string;
  detail: SupplierDetail;
  obligations: Obligation[];
  canUpload: boolean;
  caption: string;
}) {
  const [t, tUpload, format, locale] = await Promise.all([
    getTranslations("requirements"),
    getTranslations("upload"),
    getFormatter(),
    getLocale(),
  ]);
  const lang: Locale = isLocale(locale) ? locale : "es";
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });
  const typeName = (code: string) => findType(DEFAULT_CATALOG, code)?.name[lang] ?? code;
  const party = detail.party;

  const scope = (o: Obligation) => {
    const s = o.requirement.subject;
    if (s.kind === "party") return t("scope.party");
    if (s.kind === "site") {
      const site = detail.sites.find((x) => x.id === s.siteId);
      return t("scope.site", { site: site?.name ?? t("legacySite", { city: site?.city ?? "" }) });
    }
    return t("scope.source", { material: detail.labels.sources[s.sourceId] ?? s.sourceId });
  };
  const because = (o: Obligation) => {
    const materials = [...new Set(o.requirement.sourceIds.map((id) => detail.labels.sources[id]).filter(Boolean))];
    const shown = materials.slice(0, 3).join(", ");
    const more = materials.length > 3 ? t("andMore", { count: materials.length - 3 }) : "";
    return (
      <span className="grid gap-0.5 text-sm">
        <span>{t(`because.${o.requirement.reason}`)}</span>
        {materials.length ? (
          <span className="text-xs text-muted-foreground">{t("becauseMaterials", { list: `${shown}${more}` })}</span>
        ) : null}
      </span>
    );
  };
  const target = (o: Obligation) => {
    const subject = o.requirement.subject;
    return uploadHref(company, {
      supplier: party.id,
      para: subject.kind === "source" ? subject.sourceId : subject.kind === "site" ? subject.siteId : undefined,
      tipo: o.requirement.anyOf[0],
    });
  };

  const columns: Column<Obligation>[] = [
    {
      key: "requirement",
      header: t("col.requirement"),
      primary: true,
      cell: (o) => (
        <span id={obligationAnchor(o.requirement.key)} className="grid scroll-mt-24 gap-0.5">
          <span className="font-semibold">{t(`name.${o.requirement.code}`)}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {o.requirement.anyOf.map(typeName).join(` ${t("or")} `)}
          </span>
        </span>
      ),
    },
    {
      key: "program",
      header: t("col.program"),
      cell: (o) => <span className="text-sm">{findProgram(o.requirement.program).name[lang]}</span>,
    },
    { key: "scope", header: t("col.scope"), cell: (o) => <span className="text-sm">{scope(o)}</span> },
    { key: "because", header: t("col.because"), cell: because },
    {
      key: "priority",
      header: t("col.priority"),
      cell: (o) => (
        <span className="grid gap-0.5 text-xs">
          <span className={cn("font-semibold", SEVERITY_TONE[o.requirement.severity])}>
            {t(`severity.${o.requirement.severity}`)}
          </span>
          {o.requirement.blocking ? (
            <span className="font-semibold text-status-missing">{t("blockingTag")}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "status",
      header: t("col.status"),
      cell: (o) => (
        <span className="grid justify-items-end gap-1 md:justify-items-start">
          <StatusPill status={o.status} />
          {o.override ? (
            <span className="text-xs text-muted-foreground">
              {o.override.until ? t("waivedUntil", { date: date(o.override.until) }) : null} {o.override.reason}
            </span>
          ) : null}
          {o.status === "rejected" && o.rejected?.rejectionReason ? (
            <span className="text-xs text-muted-foreground">{o.rejected.rejectionReason}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "dates",
      header: t("col.dates"),
      className: "tabular-nums",
      cell: (o) =>
        o.document ? (
          <span className="grid gap-0.5 text-xs">
            <span>{o.expiresOn ? t("validThrough", { date: date(o.expiresOn) }) : t("neverExpires")}</span>
            {o.document.reviewedOn ? (
              <span className="text-muted-foreground">{t("reviewedOn", { date: date(o.document.reviewedOn) })}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "action",
      header: t("col.action"),
      cell: (o) => {
        const links = [];
        if (o.pending) {
          links.push(
            <Link
              key="review"
              href={documentHref(company, o.pending.id)}
              className="font-semibold text-primary hover:underline"
            >
              {t("action.review")}
            </Link>,
          );
        }
        if (o.document) {
          links.push(
            <Link key="doc" href={documentHref(company, o.document.id)} className="text-primary hover:underline">
              {t("action.evidence")}
            </Link>,
          );
        }
        if (canUpload && !o.pending && ["missing", "expired", "expiring", "rejected"].includes(o.status)) {
          links.push(
            <Link key="upload" href={target(o)} className="font-semibold text-primary hover:underline">
              {tUpload("short")}
            </Link>,
          );
        }
        return links.length ? (
          <span className="inline-flex flex-wrap gap-x-3 gap-y-1 text-sm">{links}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
  ];

  return <ResponsiveTable columns={columns} rows={obligations} rowKey={(o) => o.requirement.key} caption={caption} />;
}
