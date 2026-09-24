import { SearchX } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";

/** Unknown supplier: stays inside the app frame and leads back to the list. */
export default async function NotFound() {
  const t = await getTranslations("supplier");
  return (
    <div className="grid justify-items-center gap-4 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground">
        <SearchX aria-hidden className="size-6" />
      </span>
      <h1 className="text-2xl font-bold">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundBody")}</p>
      {/* "./" is the supplier list: this page lives at /{company}/suplidores/{id}. */}
      <Link href="./" className={buttonVariants()}>
        {t("back")}
      </Link>
    </div>
  );
}
