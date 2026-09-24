import type { Metadata } from "next";

import { SectionGate } from "@/components/section-gate";
import { SectionPlaceholder, sectionText } from "@/components/section-placeholder";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await sectionText("requests")).title };
}

export default async function Page({ params }: PageProps<"/[company]/solicitudes">) {
  const { company } = await params;
  return (
    <SectionGate company={company} section="requests" permission="requests.send">
      <SectionPlaceholder section="requests" />
    </SectionGate>
  );
}
