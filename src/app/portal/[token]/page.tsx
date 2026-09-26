import { CircleCheck, Lock } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { LanguageSwitch } from "@/components/app-shell/language-switch";
import { ItemStatusBadge } from "@/components/requests/request-badges";
import { PortalUploadForm } from "@/components/requests/portal-upload-form";
import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import { isSupplierTurn } from "@/domain/requests";
import { isLocale } from "@/i18n/config";
import { openPortal } from "@/server/portal";
import { portalUploadAction } from "@/server/request-actions";

/*
 * /portal/{secret}: the supplier's page for one request. No account: the secret in the link is
 * the only key, it opens only this request, and nothing else of the company or of other
 * suppliers is ever shown. Built for phones first.
 */

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getTranslations("portal"))("title"),
    // The link is a credential: never send it to other sites in the Referer header.
    referrer: "no-referrer",
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: PageProps<"/portal/[token]">) {
  const { token } = await params;
  const [result, t, tStatus, tReq, format, locale] = await Promise.all([
    openPortal(token),
    getTranslations("portal"),
    getTranslations("portal.status"),
    getTranslations("requirements.name"),
    getFormatter(),
    getLocale(),
  ]);
  const lang = isLocale(locale) ? locale : "es";
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "long" });

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
        <Image src="/brand/stratum-logo.png" alt="Stratum" width={3834} height={720} className="h-6 w-auto" />
        <LanguageSwitch />
      </header>
      <main id="main" className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-6">
        {!result.ok ? (
          <section className="grid justify-items-center gap-3 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <Lock aria-hidden className="size-6" />
            </span>
            <h1 className="text-2xl font-bold">{t("denialTitle")}</h1>
            <p className="max-w-md text-muted-foreground">{t(`denial.${result.denial}`)}</p>
          </section>
        ) : (
          <>
            <div className="grid gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
              <p>{t("intro", { company: result.view.companyName, party: result.view.partyName })}</p>
              <p className="font-semibold">{t("due", { date: day(result.view.dueOn) })}</p>
              {result.view.message ? (
                <blockquote className="border-l-4 border-primary/40 pl-3 text-sm">
                  <span className="block text-xs font-semibold text-muted-foreground">
                    {t("message", { company: result.view.companyName })}
                  </span>
                  {result.view.message}
                </blockquote>
              ) : null}
            </div>

            <section aria-labelledby="portal-items" className="grid gap-4">
              <h2 id="portal-items" className="text-lg font-semibold">
                {t("items")}
              </h2>
              {result.view.items.every((i) => !isSupplierTurn(i)) ? (
                <p
                  role="status"
                  className="flex gap-2 rounded-lg bg-status-current-bg px-3 py-2 text-sm text-status-current"
                >
                  <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t("allDone")}
                </p>
              ) : null}
              <ol className="grid gap-4">
                {result.view.items.map((item) => {
                  const types = item.types.map((code) => ({
                    code,
                    name: findType(DEFAULT_CATALOG, code)?.name[lang] ?? code,
                  }));
                  return (
                    <li key={item.id} className="grid gap-3 rounded-xl border bg-card p-4">
                      <div className="grid gap-1">
                        <h3 className="font-semibold">{tReq(item.code)}</h3>
                        {item.subject.material || item.subject.site ? (
                          <p className="text-sm text-muted-foreground">
                            {[item.subject.material, item.subject.site].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                        {types.length > 1 ? (
                          <p className="text-xs text-muted-foreground">
                            {t("acceptedOne")} {types.map((x) => x.name).join(", ")}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">{types[0]?.name}</p>
                        )}
                        <div>
                          <ItemStatusBadge status={item.status} label={tStatus(item.status as "requested")} />
                        </div>
                        {item.rejectionReason ? (
                          <p className="rounded-lg bg-status-missing-bg px-3 py-2 text-sm text-status-missing">
                            {t("rejectedBecause", { reason: item.rejectionReason })}
                          </p>
                        ) : null}
                        {item.status === "uploaded" || item.status === "resubmitted" ? (
                          <p className="text-sm text-muted-foreground">
                            {t("sent", { company: result.view.companyName })}
                          </p>
                        ) : null}
                      </div>
                      {isSupplierTurn(item) ? (
                        <PortalUploadForm
                          action={portalUploadAction.bind(null, token, item.id)}
                          itemId={item.id}
                          types={types}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>

            <footer className="grid gap-1 border-t pt-4 text-xs text-muted-foreground">
              <p>{t("expires", { date: day(result.view.expiresOn) })}</p>
              <p>{t("privacy", { company: result.view.companyName })}</p>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
