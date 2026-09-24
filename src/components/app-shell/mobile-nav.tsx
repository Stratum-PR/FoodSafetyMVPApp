"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { NavLinks } from "./nav-links";

/** Phone and small-tablet menu: the same links as the sidebar, in a side sheet. */
export function MobileNav({ company }: { company: string }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("openMenu")} />}>
        <Menu aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-4">
        {/* pr-10 keeps the logo clear of the sheet's close button; self-start stops it stretching */}
        <SheetHeader className="p-0 pr-10">
          <SheetTitle className="sr-only">{t("menuTitle")}</SheetTitle>
          <Image
            src="/brand/stratum-logo.png"
            alt="Stratum"
            width={3834}
            height={720}
            className="h-7 w-auto self-start"
          />
        </SheetHeader>
        <nav aria-label={t("label")} className="mt-4">
          <NavLinks company={company} onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
