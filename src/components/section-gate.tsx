import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { type SectionKey, sectionText } from "@/components/section-placeholder";
import { can, type Permission } from "@/domain/permissions";
import { getRequestContext } from "@/server/context";

/**
 * Shows a section only to roles with the permission; others get a friendly explanation.
 * The services check permissions again, so hiding the page is a courtesy, not the guard.
 */
export async function SectionGate({
  company,
  section,
  permission,
  children,
}: {
  company: string;
  section: SectionKey;
  permission: Permission;
  children: ReactNode;
}) {
  const ctx = await getRequestContext(company);
  if (can(ctx.actor.role, permission)) return children;

  const [{ title }, t] = await Promise.all([sectionText(section), getTranslations("noAccess")]);
  return (
    <div className="grid gap-6">
      <PageHeader title={title} />
      <EmptyState icon={Lock} title={t("title")} body={t("body")} />
    </div>
  );
}
