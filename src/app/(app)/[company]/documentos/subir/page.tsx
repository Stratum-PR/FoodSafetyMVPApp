import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { navHref, supplierHref } from "@/components/app-shell/nav-items";
import { UploadForm } from "@/components/documents/upload-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DEFAULT_CATALOG } from "@/domain/catalog";
import { can } from "@/domain/permissions";
import { isLocale } from "@/i18n/config";
import { getRequestContext } from "@/server/context";
import { uploadDocumentAction } from "@/server/document-actions";
import { listUploadTargets } from "@/server/documents";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("upload"))("title") };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * /{company}/documentos/subir?suplidor=…&para=…&tipo=… — the query pre-fills the form, e.g.
 * from a supplier's page or a missing requirement. Unknown values are simply ignored.
 */
export default async function Page({ params, searchParams }: PageProps<"/[company]/documentos/subir">) {
  const [{ company }, query] = await Promise.all([params, searchParams]);
  const ctx = await getRequestContext(company);
  const [t, locale] = await Promise.all([getTranslations("upload"), getLocale()]);

  const back = (
    <Link
      href={navHref(company, "documentos")}
      className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {(await getTranslations("document"))("back")}
    </Link>
  );

  if (!can(ctx.actor.role, "documents.upload")) {
    return (
      <div className="grid grid-cols-1 gap-6">
        {back}
        <PageHeader title={t("title")} />
        <EmptyState icon={Lock} title={t("noAccessTitle")} body={t("noAccessBody")} />
      </div>
    );
  }

  const suppliers = await listUploadTargets(ctx);
  const supplier = suppliers.find((s) => s.id === first(query.suplidor));
  const para = first(query.para);
  const about = supplier?.materials.some((m) => m.sourceId === para) ? para : "party";
  const cancelHref = supplier ? supplierHref(company, supplier.id) : navHref(company, "documentos");

  return (
    <div className="grid grid-cols-1 gap-6">
      {back}
      <PageHeader title={t("title")} description={t("description")} />
      <UploadForm
        action={uploadDocumentAction.bind(null, company)}
        suppliers={suppliers}
        types={DEFAULT_CATALOG}
        lang={isLocale(locale) ? locale : "es"}
        initial={{ partyId: supplier?.id ?? "", about, typeCode: first(query.tipo) }}
        cancelHref={cancelHref}
      />
    </div>
  );
}
