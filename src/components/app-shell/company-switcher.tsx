"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Company } from "@/domain/company";

/** Switches between the companies the user belongs to (consultants may have several). */
export function CompanySwitcher({ current, companies }: { current: Company; companies: Company[] }) {
  const t = useTranslations("topbar");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="h-9 max-w-[16rem] justify-between gap-2"
            aria-label={t("switchCompany")}
          />
        }
      >
        <Building2 aria-hidden className="text-muted-foreground" />
        <span className="truncate">{current.name}</span>
        <ChevronsUpDown aria-hidden className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("company")}</DropdownMenuLabel>
          {companies.map((c) => (
            <MenuPrimitive.LinkItem
              key={c.slug}
              closeOnClick
              render={<Link href={`/${c.slug}`} />}
              className="flex cursor-default items-center gap-2 rounded-md px-1.5 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
            >
              <span className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{c.name}</span>
                <span className="truncate text-xs text-muted-foreground">{c.city}</span>
              </span>
              {c.slug === current.slug ? <Check aria-hidden className="size-4" /> : null}
            </MenuPrimitive.LinkItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
