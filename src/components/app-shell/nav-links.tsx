"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import type { Role } from "@/domain/permissions";
import { can } from "@/domain/permissions";
import { cn } from "@/lib/utils";

import { NAV_ITEMS, navHref } from "./nav-items";

/** The section links the role can open, used in the desktop sidebar and the phone menu. */
export function NavLinks({ company, role, onNavigate }: { company: string; role: Role; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <ul className="grid gap-1">
      {NAV_ITEMS.filter((item) => can(role, item.permission)).map(({ key, segment, icon: Icon }) => {
        const href = navHref(company, segment);
        const active = segment ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href;
        return (
          <li key={key}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                active &&
                  "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
              )}
            >
              <Icon aria-hidden className="size-4.5 shrink-0" />
              {t(key)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
