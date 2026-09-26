import { Mail, Phone, Star } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { ObligationTable } from "@/components/suppliers/obligation-table";
import { Fact, Section } from "@/components/suppliers/section";
import { Fsma204Badge, RiskBadge } from "@/components/suppliers/summary-badges";
import { isUnmet } from "@/domain/obligations";
import { can } from "@/domain/permissions";
import { RISK_FACTORS } from "@/domain/risk";
import type { RequestContext } from "@/server/context";
import type { SupplierDetail } from "@/server/supplier-detail";

/** Who the supplier is, who to talk to, what blocks it, and its risk and FSMA 204 assessments. */
export async function SupplierOverview({
  company,
  detail,
  ctx,
}: {
  company: string;
  detail: SupplierDetail;
  ctx: RequestContext;
}) {
  const [t, tType, tRisk, format] = await Promise.all([
    getTranslations("supplier"),
    getTranslations("partyType"),
    getTranslations("risk"),
    getFormatter(),
  ]);
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });
  const { party } = detail;
  const blocking = detail.obligations.filter((o) => o.requirement.blocking && isUnmet(o.status));
  const risk = detail.risk.current;
  const fsma = detail.fsma204.current;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={t("overview.company")}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2">
            <Fact label={t("overview.roles")}>{tType(party.type)}</Fact>
            <Fact label={t("overview.direction")}>{t(`direction.${party.direction}`)}</Fact>
            <Fact label={t("facts.location")}>{`${party.city}, ${party.country}`}</Fact>
            <Fact label={t("overview.sites")}>{t("overview.sitesCount", { count: detail.sites.length })}</Fact>
            <Fact label={t("facts.addedBy")}>{detail.createdByName}</Fact>
            <Fact label={t("overview.fsvp")}>{detail.foreign ? t("overview.fsvpYes") : t("overview.fsvpNo")}</Fact>
          </dl>
        </Section>
        <Section title={t("overview.contacts")} hint={t("overview.contactsHint")}>
          {detail.contacts.length ? (
            <ul className="grid gap-2">
              {detail.contacts.map((c) => (
                <li key={c.id} className="grid gap-1 rounded-xl border bg-card p-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {c.name}
                    {c.isPrimary ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                        <Star aria-hidden className="size-3" />
                        {t("overview.primary")}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`contactRole.${c.role}`)} · {t(`language.${c.language}`)}
                  </span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Mail aria-hidden className="size-3.5" />
                      {c.email}
                    </a>
                    {c.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone aria-hidden className="size-3.5" />
                        {c.phone}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("overview.noContacts")}</p>
          )}
        </Section>
      </div>

      <Section id="bloqueos" title={t("overview.blocking")} hint={t("overview.blockingHint")}>
        {blocking.length ? (
          <ObligationTable
            company={company}
            detail={detail}
            obligations={blocking}
            canUpload={can(ctx.actor.role, "documents.upload")}
            caption={t("overview.blocking")}
          />
        ) : (
          <p className="rounded-xl border border-dashed bg-card px-4 py-3 text-sm text-muted-foreground">
            {t("overview.noBlocking")}
          </p>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section id="riesgo" title={t("risk.title")} hint={t("risk.hint")}>
          <div className="grid gap-3 rounded-xl border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <RiskBadge rating={risk?.rating ?? null} />
              {risk ? (
                <span className="text-xs text-muted-foreground">
                  {t("risk.by", { version: risk.version, name: risk.assessedByName, date: date(risk.assessedOn) })}
                </span>
              ) : null}
            </div>
            {risk ? (
              <>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {RISK_FACTORS.map((f) => (
                    <Fact key={f} label={t(`risk.factor.${f}`)}>
                      {tRisk(risk.factors[f])}
                    </Fact>
                  ))}
                </dl>
                <p>{risk.rationale}</p>
                <p className="text-xs text-muted-foreground">
                  {t("risk.suggested", { rating: tRisk(risk.suggested), policy: risk.policyVersion })} ·{" "}
                  {t("risk.nextReview", { date: date(risk.nextReviewOn) })}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">{t("risk.none")}</p>
            )}
            <p className="text-xs text-muted-foreground">{t("risk.materialNote")}</p>
          </div>
        </Section>

        <Section id="fsma204" title={t("fsma.title")} hint={t("fsma.hint")}>
          <div className="grid gap-3 rounded-xl border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Fsma204Badge status={fsma?.decision ?? "not_assessed"} />
              {fsma ? (
                <span className="text-xs text-muted-foreground">
                  {t("fsma.by", { name: fsma.assessedByName, date: date(fsma.assessedOn) })}
                </span>
              ) : null}
            </div>
            {fsma ? (
              <>
                <p>{fsma.rationale}</p>
                {fsma.exemption ? <p className="text-xs">{t("fsma.exemption", { text: fsma.exemption })}</p> : null}
              </>
            ) : (
              <p className="text-muted-foreground">{t("fsma.none")}</p>
            )}
            <p className="text-xs text-muted-foreground">{t(`fsma.hints.${detail.fsma204.hint}`)}</p>
            <p className="text-xs text-muted-foreground">{t("fsma.later")}</p>
          </div>
        </Section>
      </div>
    </>
  );
}
