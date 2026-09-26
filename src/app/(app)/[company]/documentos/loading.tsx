import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

/** While the document list loads (filters and pages are server-rendered). */
export default async function Loading() {
  const t = await getTranslations("documents");
  return (
    <div className="grid grid-cols-1 gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        {t("loading")}
      </p>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-40 w-full" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
