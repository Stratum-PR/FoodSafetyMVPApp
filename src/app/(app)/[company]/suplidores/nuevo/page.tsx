import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { navHref } from "@/components/app-shell/nav-items";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { NewSupplierForm } from "@/components/suppliers/new-supplier-form";
import { can } from "@/domain/permissions";
import { getRequestContext } from "@/server/context";
import { createSupplierAction } from "@/server/supplier-actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("newSupplier"))("title") };
}

export default async function Page({ params }: PageProps<"/[company]/suplidores/nuevo">) {
  const { company } = await params;
  const ctx = await getRequestContext(company);
  const [t, tSupplier] = await Promise.all([getTranslations("newSupplier"), getTranslations("supplier")]);
  const listHref = navHref(company, "suplidores");

  return (
    <div className="grid grid-cols-1 gap-6">
      <Link
        href={listHref}
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {tSupplier("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      {can(ctx.actor.role, "suppliers.edit") ? (
        <NewSupplierForm action={createSupplierAction.bind(null, company)} cancelHref={listHref} />
      ) : (
        <EmptyState icon={Lock} title={t("noAccessTitle")} body={t("noAccessBody")} />
      )}
    </div>
  );
}
