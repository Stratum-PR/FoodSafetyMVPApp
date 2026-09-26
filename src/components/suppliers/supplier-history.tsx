import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { documentHref } from "@/components/app-shell/nav-items";
import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import { isLocale, type Locale } from "@/i18n/config";
import { getApprovalPanel } from "@/server/approvals";
import type { RequestContext } from "@/server/context";
import type { SupplierDetail } from "@/server/supplier-detail";

type Entry = { key: string; on: string; title: string; detail?: string; by?: string; href?: string };

/**
 * Everything recorded about this supplier, newest first, in one timeline: approval decisions,
 * risk and FSMA 204 assessments (every version), waivers, nonconformities and every document
 * version received. Nothing here is edited or deleted; each entry is its own record.
 */
export async function SupplierHistory({ ctx, detail }: { ctx: RequestContext; detail: SupplierDetail }) {
  const [panel, t, tApproval, tRisk, tFsma, tState, format, locale] = await Promise.all([
    getApprovalPanel(ctx, detail.party.id),
    getTranslations("supplier.history"),
    getTranslations("approval"),
    getTranslations("risk"),
    getTranslations("fsma204.status"),
    getTranslations("supplier.docState"),
    getFormatter(),
    getLocale(),
  ]);
  const lang: Locale = isLocale(locale) ? locale : "es";
  const company = ctx.company.slug;
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });
  const typeName = (code: string) => findType(DEFAULT_CATALOG, code)?.name[lang] ?? code;

  const entries: Entry[] = [
    ...(panel?.history ?? []).map((a) => ({
      key: a.id,
      on: a.on,
      title: t("approval", { action: tApproval(`actions.${a.action}`) }),
      detail: [a.reason, a.terms?.conditions].filter(Boolean).join(" · ") || undefined,
      by: a.actorName,
    })),
    ...detail.risk.history.map((r) => ({
      key: r.id,
      on: r.assessedOn,
      title: t("risk", { version: r.version, rating: tRisk(r.rating) }),
      detail: `${r.rationale} (${t("policy", { version: r.policyVersion })})`,
      by: r.assessedByName,
    })),
    ...detail.fsma204.history.map((f) => ({
      key: f.id,
      on: f.assessedOn,
      title: t("fsma", { decision: tFsma(f.decision) }),
      detail: f.rationale,
      by: f.assessedByName,
    })),
    ...detail.overrides.map((o) => ({
      key: o.id,
      on: o.on,
      title: o.kind === "waived" ? t("waived", { until: o.until ? date(o.until) : "" }) : t("notApplicable"),
      detail: o.reason,
      by: o.byName,
    })),
    ...(panel?.nonconformities ?? []).flatMap((n) => [
      { key: n.id, on: n.recordedOn, title: t("nonconformity"), detail: n.description, by: n.recordedByName },
      ...(n.closedOn
        ? [
            {
              key: `${n.id}-closed`,
              on: n.closedOn,
              title: t("nonconformityClosed"),
              detail: n.closeNote,
              by: n.closedByName,
            },
          ]
        : []),
    ]),
    ...detail.documents.map((d) => ({
      key: d.id,
      on: d.receivedOn,
      title: t("document", { type: typeName(d.typeCode), state: tState(d.state) }),
      detail: d.materialName ?? d.siteName ?? undefined,
      by: d.uploadedByName,
      href: documentHref(company, d.id),
    })),
  ].sort((a, b) => b.on.localeCompare(a.on) || a.key.localeCompare(b.key));

  return (
    <section className="grid gap-3" aria-labelledby="history-title">
      <div>
        <h2 id="history-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>
      <ol className="grid gap-2">
        {entries.map((e) => (
          <li key={e.key} className="grid gap-0.5 rounded-xl border bg-card p-3 text-sm sm:grid-cols-[8rem_1fr]">
            <time dateTime={e.on} className="text-xs text-muted-foreground tabular-nums sm:text-sm">
              {date(e.on)}
            </time>
            <div className="grid min-w-0 gap-0.5">
              <span className="font-semibold">
                {e.href ? (
                  <Link href={e.href} className="text-primary hover:underline">
                    {e.title}
                  </Link>
                ) : (
                  e.title
                )}
              </span>
              {e.detail ? <span className="break-words">{e.detail}</span> : null}
              {e.by ? <span className="text-xs text-muted-foreground">{t("by", { name: e.by })}</span> : null}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">{t("auditNote")}</p>
    </section>
  );
}
