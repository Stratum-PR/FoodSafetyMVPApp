import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { SampleDataBadge } from "@/components/sample-data-badge";
import type { Company } from "@/domain/company";
import type { Role } from "@/domain/permissions";

import { CompanySwitcher } from "./company-switcher";
import { LanguageSwitch } from "./language-switch";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { UserMenu } from "./user-menu";

/** The frame around every company page: sidebar on computers, top bar everywhere, menu sheet on phones. */
export function AppShell({
  company,
  companies,
  sampleData,
  role,
  children,
}: {
  company: Company;
  companies: Company[];
  sampleData: boolean;
  role: Role;
  children: ReactNode;
}) {
  const t = useTranslations("nav");

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar px-4 py-5 lg:flex">
        <Link href={`/${company.slug}`} className="px-2" aria-label="Stratum">
          <Image
            src="/brand/stratum-logo.png"
            alt="Stratum"
            width={3834}
            height={720}
            priority
            className="h-7 w-auto"
          />
        </Link>
        <nav aria-label={t("label")} className="mt-8">
          <NavLinks company={company.slug} role={role} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-1.5 border-b bg-background/90 px-3 backdrop-blur sm:gap-2 sm:px-6">
          <MobileNav company={company.slug} role={role} />
          <CompanySwitcher current={company} companies={companies} />
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {sampleData ? (
              <span className="hidden sm:inline-flex">
                <SampleDataBadge />
              </span>
            ) : null}
            <LanguageSwitch />
            <UserMenu role={role} canPreview={sampleData} />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {sampleData ? (
            <div className="mb-4 sm:hidden">
              <SampleDataBadge />
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
