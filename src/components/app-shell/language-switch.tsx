"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { setLocale } from "@/i18n/actions";
import { type Locale, locales } from "@/i18n/config";
import { cn } from "@/lib/utils";

const LABEL: Record<Locale, string> = { es: "ES", en: "EN" };

/** ES / EN switch. Saves the choice in a cookie, then re-renders the page in that language. */
export function LanguageSwitch() {
  const t = useTranslations("topbar");
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === current) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="inline-flex rounded-lg border bg-card p-0.5"
      aria-busy={pending}
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === current}
          aria-label={l === "es" ? t("spanish") : t("english")}
          onClick={() => choose(l)}
          disabled={pending}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-bold text-muted-foreground transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            l === current && "bg-primary text-primary-foreground",
          )}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
