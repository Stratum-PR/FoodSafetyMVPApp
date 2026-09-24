"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Unexpected errors: a friendly message and a reference code. The code is the error's
 * digest, which matches the server logs (Application Insights, later). No technical
 * details are shown to users.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  const code = error.digest ?? t("noReference");

  return (
    <main id="main" className="mx-auto grid min-h-[60dvh] max-w-lg place-items-center px-4 py-12 text-center">
      <div className="grid justify-items-center gap-4">
        <span className="grid size-12 place-items-center rounded-full bg-status-missing-bg text-status-missing">
          <TriangleAlert aria-hidden className="size-6" />
        </span>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("body")}</p>
        <p className="rounded-md bg-muted px-3 py-1.5 font-mono text-sm" data-testid="error-reference">
          {t("reference", { code })}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => retry()}>{t("retry")}</Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            {t("home")}
          </Link>
        </div>
      </div>
    </main>
  );
}
