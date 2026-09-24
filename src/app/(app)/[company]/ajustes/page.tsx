import type { Metadata } from "next";

import { SectionGate } from "@/components/section-gate";
import { SectionPlaceholder, sectionText } from "@/components/section-placeholder";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await sectionText("settings")).title };
}

export default async function Page({ params }: PageProps<"/[company]/ajustes">) {
  const { company } = await params;
  return (
    <SectionGate company={company} section="settings" permission="settings.manage">
      <SectionPlaceholder section="settings" />
    </SectionGate>
  );
}
