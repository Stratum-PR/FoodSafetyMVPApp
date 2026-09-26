import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { documentHref } from "@/components/app-shell/nav-items";
import { ObligationTable } from "@/components/suppliers/obligation-table";
import { Fact, Section } from "@/components/suppliers/section";
import { CertificationBadge } from "@/components/suppliers/summary-badges";
import type { SupplierDetail } from "@/server/supplier-detail";

/** Scheme codes with a display name (the certificate details store the code). */
const SCHEMES = [
  "sqf",
  "brcgs",
  "fssc22000",
  "ifs",
  "globalgap",
  "primusgfs",
  "canadagap",
  "gsa_bap",
  "other",
] as const;
type Scheme = (typeof SCHEMES)[number];

/**
 * Each site of the supplier: where it is, its FDA and GS1 identifiers, its certification (per
 * facility: one plant's certificate never covers another) and its facility requirements.
 */
export async function SupplierFacilities({
  company,
  detail,
  canUpload,
}: {
  company: string;
  detail: SupplierDetail;
  canUpload: boolean;
}) {
  const [t, format] = await Promise.all([getTranslations("supplier"), getFormatter()]);
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });

  return (
    <Section title={t("facilities.title")} hint={t("facilities.hint")}>
      <ul className="grid gap-4">
        {detail.sites.map((site) => {
          const cert = site.certification;
          const details = cert.details;
          return (
            <li key={site.id} className="grid gap-4 rounded-xl border bg-card p-4" data-site={site.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-0.5">
                  <h3 className="font-semibold break-words">
                    {site.name ?? t("facilities.legacyName", { city: site.city })}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {site.kind ? t(`siteKind.${site.kind}`) : t("facilities.kindUnknown")}
                    {site.legacy ? ` · ${t("facilities.legacy")}` : ""}
                  </p>
                </div>
                <CertificationBadge status={cert.status} />
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Fact label={t("facilities.address")}>
                  {site.address ? `${site.address}, ${site.city}, ${site.country}` : `${site.city}, ${site.country}`}
                </Fact>
                <Fact label={t("facts.fei")}>{site.fei ?? t("facts.feiNone")}</Fact>
                <Fact label={t("facilities.gln")}>{site.gln ?? t("facilities.glnNone")}</Fact>
                <Fact label={t("facilities.certificate")}>
                  {cert.document ? (
                    <Link href={documentHref(company, cert.document.id)} className="text-primary hover:underline">
                      {cert.expiresOn
                        ? t("facilities.validThrough", { date: date(cert.expiresOn) })
                        : t("facilities.open")}
                    </Link>
                  ) : (
                    t("facilities.noCertificate")
                  )}
                </Fact>
              </dl>
              {details ? (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Fact label={t("facilities.scheme")}>
                    {SCHEMES.includes(details.scheme as Scheme)
                      ? t(`scheme.${details.scheme as Scheme}`)
                      : details.scheme}
                  </Fact>
                  <Fact label={t("facilities.scope")}>{details.scope}</Fact>
                  <Fact label={t("facilities.issuingBody")}>{details.issuingBody}</Fact>
                  <Fact label={t("facilities.number")}>{details.certificateNumber}</Fact>
                  <Fact label={t("facilities.auditDate")}>{details.auditDate ? date(details.auditDate) : "—"}</Fact>
                  <Fact label={t("facilities.verified")}>
                    {details.directoryVerified
                      ? cert.document?.reviewedOn
                        ? t("facilities.directoryChecked", { date: date(cert.document.reviewedOn) })
                        : t("facilities.directoryCheckedNoDate")
                      : t("facilities.notVerified")}
                  </Fact>
                </dl>
              ) : cert.status === "pending_verification" ? (
                <p className="text-sm text-muted-foreground">{t("facilities.pdfOnly")}</p>
              ) : null}
              {site.obligations.length ? (
                <ObligationTable
                  company={company}
                  detail={detail}
                  obligations={site.obligations}
                  canUpload={canUpload}
                  caption={t("facilities.requirements", {
                    site: site.name ?? t("facilities.legacyName", { city: site.city }),
                  })}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t("facilities.nothingBought")}</p>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
