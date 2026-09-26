import { ArrowLeft, Send } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requestsHref } from "@/components/requests/hrefs";
import { NewRequestForm } from "@/components/requests/new-request-form";
import { SectionGate } from "@/components/section-gate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addDays } from "@/domain/dates";
import { findProgram } from "@/domain/programs";
import { DUE_MAX_DAYS, DUE_MIN_DAYS } from "@/domain/requests";
import { isLocale } from "@/i18n/config";
import { getRequestContext } from "@/server/context";
import { createRequestAction } from "@/server/request-actions";
import { defaultDueOn, listRequestTargets } from "@/server/requests";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("requests.form"))("title") };
}

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** /{company}/solicitudes/nueva?suplidor=…&pedir=… — pick a supplier, then what to ask of them. */
export default async function Page({ params, searchParams }: PageProps<"/[company]/solicitudes/nueva">) {
  const [{ company }, query] = await Promise.all([params, searchParams]);
  return (
    <SectionGate company={company} section="requests" permission="requests.send">
      <NewRequest company={company} supplier={list(query.suplidor)[0] ?? ""} keys={list(query.pedir)} />
    </SectionGate>
  );
}

async function NewRequest({ company, supplier, keys }: { company: string; supplier: string; keys: string[] }) {
  const ctx = await getRequestContext(company);
  const [targets, t, tDetail, tReq, tList, locale] = await Promise.all([
    listRequestTargets(ctx),
    getTranslations("requests.form"),
    getTranslations("requests.detail"),
    getTranslations("requirements.name"),
    getTranslations("documents"),
    getLocale(),
  ]);
  const lang = isLocale(locale) ? locale : "es";
  const target = targets.find((x) => x.partyId === supplier);
  const action = `/${company}/solicitudes/nueva`;

  return (
    <div className="grid grid-cols-1 gap-6">
      <Link
        href={requestsHref(company)}
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {tDetail("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />

      {targets.length ? (
        <Form action={action} className="flex max-w-3xl flex-wrap items-end gap-2">
          <div className="grid min-w-64 flex-1 gap-1.5">
            <Label htmlFor="nr-supplier">{t("supplier")}</Label>
            <select id="nr-supplier" name="suplidor" defaultValue={target?.partyId ?? ""} className={SELECT}>
              <option value="">{t("chooseSupplier")}</option>
              {targets.map((x) => (
                <option key={x.partyId} value={x.partyId}>
                  {x.partyName} ({t("gapCount", { count: x.gaps.filter((g) => !g.requested).length })})
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">
            {t("next")}
          </Button>
        </Form>
      ) : (
        <EmptyState icon={Send} title={t("noSuppliers")} />
      )}

      {target ? (
        target.gaps.some((g) => !g.requested) ? (
          <NewRequestForm
            // A new supplier starts a fresh form.
            key={target.partyId}
            action={createRequestAction.bind(null, company)}
            target={target}
            checked={keys}
            dueOn={defaultDueOn(ctx.today)}
            minDue={addDays(ctx.today, DUE_MIN_DAYS)}
            maxDue={addDays(ctx.today, DUE_MAX_DAYS)}
            labels={Object.fromEntries(
              target.gaps.map((g) => [
                g.key,
                {
                  title: tReq(g.code),
                  detail: [
                    findProgram(g.program).name[lang],
                    g.subject.material ?? g.subject.site ?? tList("company"),
                    g.blocking ? tList("gaps.blocking") : null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                },
              ]),
            )}
          />
        ) : (
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm">{t("noGaps")}</p>
        )
      ) : null}
    </div>
  );
}
