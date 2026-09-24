import { SearchX } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-lg place-items-center px-4 py-12 text-center">
      <div className="grid justify-items-center gap-4">
        <span className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
          <SearchX aria-hidden className="size-6" />
        </span>
        <h1 className="text-2xl font-bold">{t("notFoundTitle")}</h1>
        <p className="text-muted-foreground">{t("notFoundBody")}</p>
        <Link href="/" className={buttonVariants()}>
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
