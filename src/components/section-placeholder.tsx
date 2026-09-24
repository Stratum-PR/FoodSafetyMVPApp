import { Hammer } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export type SectionKey = "panel" | "suppliers" | "documents" | "requests" | "history" | "settings";

/** Title and description of a section, for the page and its browser tab. */
export async function sectionText(section: SectionKey) {
  const t = await getTranslations(`pages.${section}`);
  return { title: t("title"), description: t("description") };
}

/** Week-1 placeholder: the real screen replaces this, keeping the header. */
export async function SectionPlaceholder({ section }: { section: SectionKey }) {
  const [{ title, description }, t] = await Promise.all([sectionText(section), getTranslations("empty")]);
  return (
    <div className="grid gap-6">
      <PageHeader title={title} description={description} />
      <EmptyState icon={Hammer} title={t("buildingTitle")} body={t("buildingBody")} />
    </div>
  );
}
