import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { documentHref, navHref } from "@/components/app-shell/nav-items";
import { DocumentStateBadge } from "@/components/documents/document-state-badge";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { ObligationTable } from "@/components/suppliers/obligation-table";
import { Section } from "@/components/suppliers/section";
import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import { isUnmet } from "@/domain/obligations";
import { isLocale, type Locale } from "@/i18n/config";
import type { DocumentView, SupplierDetail } from "@/server/supplier-detail";

/**
 * Requirements and evidence for this supplier. Upload, review and versions happen in the
 * shared Documents workspace; this tab links there and never computes a status of its own.
 */
export async function SupplierDocumentsTab({
  company,
  detail,
  canUpload,
}: {
  company: string;
  detail: SupplierDetail;
  canUpload: boolean;
}) {
  const [t, format, locale] = await Promise.all([getTranslations("supplier"), getFormatter(), getLocale()]);
  const lang: Locale = isLocale(locale) ? locale : "es";
  const date = (iso: string) => (
    <time dateTime={iso}>{format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" })}</time>
  );
  const typeName = (code: string) => findType(DEFAULT_CATALOG, code)?.name[lang] ?? code;
  const blocking = detail.obligations.filter((o) => o.requirement.blocking && isUnmet(o.status));
  const rest = detail.obligations.filter((o) => !blocking.includes(o));
  const pending = detail.documents.filter((d) => d.state === "pending_review");

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
    {
      key: "about",
      header: t("docCol.about"),
      cell: (d) =>
        d.materialName ?? (d.subject.kind === "site" ? (d.siteName ?? t("legacySite")) : t("supplierItself")),
    },
    { key: "received", header: t("docCol.received"), cell: (d) => date(d.receivedOn), className: "tabular-nums" },
    {
      key: "expires",
      header: t("docCol.expires"),
      cell: (d) => (d.expires ? date(d.expires) : t("neverExpires")),
      className: "tabular-nums",
    },
    { key: "state", header: t("docCol.state"), cell: (d) => <DocumentStateBadge state={d.state} /> },
    { key: "uploadedBy", header: t("docCol.uploadedBy"), cell: (d) => d.uploadedByName },
  ];

  return (
    <>
      <p className="rounded-xl border bg-card px-4 py-3 text-sm">
        {t("documentsTab.summary", {
          pending: pending.length,
          open: detail.obligations.filter((o) => isUnmet(o.status)).length,
        })}{" "}
        <Link href={navHref(company, "documentos")} className="font-semibold text-primary hover:underline">
          {t("documentsTab.workspace")}
        </Link>
      </p>

      {blocking.length ? (
        <Section title={t("documentsTab.blocking")} hint={t("overview.blockingHint")}>
          <ObligationTable
            company={company}
            detail={detail}
            obligations={blocking}
            canUpload={canUpload}
            caption={t("documentsTab.blocking")}
          />
        </Section>
      ) : null}

      <Section id="requisitos" title={t("documentsTab.requirements")} hint={t("documentsTab.requirementsHint")}>
        {rest.length ? (
          <ObligationTable
            company={company}
            detail={detail}
            obligations={rest}
            canUpload={canUpload}
            caption={t("documentsTab.requirements")}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("notEvaluated")}</p>
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
    </>
  );
}
