import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell/app-shell";
import { getCompany, listCompanies, usingSampleData } from "@/server/companies";
import { getPreviewRole, getPreviewUser } from "@/server/context";
import { SAMPLE_USERS } from "@/server/sample/suppliers";

export default async function CompanyLayout({ children, params }: LayoutProps<"/[company]">) {
  const { company: slug } = await params;
  const [company, companies, role, user] = await Promise.all([
    getCompany(slug),
    listCompanies(),
    getPreviewRole(),
    getPreviewUser(),
  ]);
  if (!company) notFound();

  return (
    <AppShell
      company={company}
      companies={companies}
      sampleData={usingSampleData}
      role={role}
      user={user}
      people={SAMPLE_USERS}
    >
      {children}
    </AppShell>
  );
}
