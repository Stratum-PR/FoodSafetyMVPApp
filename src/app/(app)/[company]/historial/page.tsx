import type { Metadata } from "next";

import { SectionGate } from "@/components/section-gate";
import { SectionPlaceholder, sectionText } from "@/components/section-placeholder";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await sectionText("history")).title };
}

export default async function Page({ params }: PageProps<"/[company]/historial">) {
  const { company } = await params;
  return (
    <SectionGate company={company} section="history" permission="history.view">
      <SectionPlaceholder section="history" />
    </SectionGate>
  );
}
