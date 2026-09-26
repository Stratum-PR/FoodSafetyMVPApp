import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { supplierHref } from "@/components/app-shell/nav-items";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { Section } from "@/components/suppliers/section";
import { SupplierMatrix } from "@/components/suppliers/supplier-matrix";
import type { QualificationStatus } from "@/domain/suppliers";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { SourceView, SupplierDetail } from "@/server/supplier-detail";

const QUAL_TONE: Record<QualificationStatus, string> = {
  approved: "bg-status-current-bg text-status-current",
  conditional: "bg-status-expiring-bg text-status-expiring",
  pending: "bg-secondary text-secondary-foreground",
  suspended: "bg-status-missing-bg text-status-missing",
  rejected: "bg-status-missing-bg text-status-missing",
  not_assessed: "border border-dashed text-muted-foreground",
};

/**
 * Each site–material relationship: whether it's bought today (commercial) and, separately,
 * its food-safety qualification, with who decided it, the specification and the COA policy.
 * Buying something is never the same as having approved it. Then the documents-by-material grid.
 */
export async function SupplierMaterials({
  company,
  detail,
  canUpload,
  view,
  incompleteOnly,
  lang,
}: {
  company: string;
  detail: SupplierDetail;
  canUpload: boolean;
  view: "ingrediente" | "documento";
  incompleteOnly: boolean;
  lang: Locale;
}) {
  const [t, format] = await Promise.all([getTranslations("supplier"), getFormatter()]);
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });

  const columns: Column<SourceView>[] = [
    {
      key: "material",
      header: t("materialsTab.material"),
      primary: true,
      cell: (s) => (
        <span className="grid gap-0.5">
          <span className="font-semibold">{s.material.name}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {s.material.code} · {t(`kind.${s.material.kind}`)}
          </span>
        </span>
      ),
    },
    {
      key: "site",
      header: t("materialsTab.site"),
      cell: (s) => (
        <span className="grid gap-0.5 text-sm">
          <span>{s.site ? (s.site.name ?? t("facilities.legacyName", { city: s.site.city })) : "—"}</span>
          <span className="text-xs text-muted-foreground">
            {s.role === "manufacturer" ? t("makes") : t("sells")}
            {" · "}
            {s.counterpart ? (
              <>
                {s.role === "manufacturer" ? t("distributedBy") : t("madeBy")}{" "}
                <Link href={supplierHref(company, s.counterpart.id)} className="text-primary hover:underline">
                  {s.counterpart.name}
                </Link>
              </>
            ) : (
              t("direct")
            )}
          </span>
        </span>
      ),
    },
    {
      key: "commercial",
      header: t("materialsTab.commercial"),
      cell: (s) => (
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
            s.commercial === "active"
              ? "border-transparent bg-secondary text-secondary-foreground"
              : "text-muted-foreground",
          )}
        >
          {t(`commercial.${s.commercial}`)}
        </span>
      ),
    },
    {
      key: "qualification",
      header: t("materialsTab.qualification"),
      cell: (s) => (
        <span className="grid justify-items-end gap-0.5 md:justify-items-start">
          <span
            data-qualification={s.qualification.status}
            className={cn(
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
              QUAL_TONE[s.qualification.status],
            )}
          >
            {t(`qualification.${s.qualification.status}`)}
          </span>
          {s.qualification.decidedOn ? (
            <span className="text-xs text-muted-foreground">
              {t("materialsTab.decided", {
                name: s.qualification.decidedByName ?? "",
                date: date(s.qualification.decidedOn),
              })}
            </span>
          ) : null}
          {s.qualification.restrictions ? (
            <span className="text-xs text-status-expiring">{s.qualification.restrictions}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "risk",
      header: t("materialsTab.materialRisk"),
      cell: (s) => <span className="text-sm">{t(`risk.${s.risk}`)}</span>,
    },
    {
      key: "controls",
      header: t("materialsTab.controls"),
      cell: (s) => (
        <span className="grid gap-0.5 text-xs">
          <span>{s.specification ? t("materialsTab.spec", { ref: s.specification }) : t("materialsTab.noSpec")}</span>
          <span className="text-muted-foreground">{t(`coaPolicy.${s.coaPolicy}`)}</span>
        </span>
      ),
    },
  ];

  return (
    <>
      <Section title={t("materials")} hint={t("materialsHint")}>
        {detail.sources.length ? (
          <ResponsiveTable columns={columns} rows={detail.sources} rowKey={(s) => s.id} caption={t("materials")} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("noMaterials")}</p>
        )}
      </Section>
      <SupplierMatrix
        company={company}
        partyId={detail.party.id}
        sources={detail.sources}
        view={view}
        incompleteOnly={incompleteOnly}
        canUpload={canUpload}
        pageHref={supplierHref(company, detail.party.id)}
        lang={lang}
      />
    </>
  );
}
