import type { Metadata } from "next";

import { SectionPlaceholder, sectionText } from "@/components/section-placeholder";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await sectionText("documents")).title };
}

export default function Page() {
  return <SectionPlaceholder section="documents" />;
}
