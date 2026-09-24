import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell/app-shell";
import { getCompany, listCompanies, usingSampleData } from "@/server/companies";

export default async function CompanyLayout({ children, params }: LayoutProps<"/[company]">) {
  const { company: slug } = await params;
  const [company, companies] = await Promise.all([getCompany(slug), listCompanies()]);
  if (!company) notFound();

  return (
    <AppShell company={company} companies={companies} sampleData={usingSampleData}>
      {children}
    </AppShell>
  );
}
