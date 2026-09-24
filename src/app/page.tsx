import { ArrowRight, Building2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LanguageSwitch } from "@/components/app-shell/language-switch";
import { SampleDataBadge } from "@/components/sample-data-badge";
import { listCompanies, usingSampleData } from "@/server/companies";

/** Company chooser. With sign-in (later), users with a single company go straight to it. */
export default async function Home() {
  const [t, companies] = await Promise.all([getTranslations("home"), listCompanies()]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <Image src="/brand/stratum-logo.png" alt="Stratum" width={3834} height={720} priority className="h-8 w-auto" />
        <LanguageSwitch />
      </header>

      <main id="main" className="mt-16 flex-1">
        {usingSampleData ? <SampleDataBadge /> : null}
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">{t("description")}</p>

        <ul className="mt-8 grid gap-3">
          {companies.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/${c.slug}`}
                className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                  <Building2 aria-hidden className="size-5" />
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-semibold">{c.name}</span>
                  <span className="truncate text-sm text-muted-foreground">{c.city}</span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
