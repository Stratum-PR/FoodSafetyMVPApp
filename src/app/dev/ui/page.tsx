import { Inbox, Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { LanguageSwitch } from "@/components/app-shell/language-switch";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { SampleDataBadge } from "@/components/sample-data-badge";
import { type DocumentStatus, StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/*
 * Component review page (/dev/ui): every design-system piece in one place, in the current
 * language, to approve the look before real screens exist. Hidden in production unless
 * SHOW_UI_REVIEW=true (for the password-protected preview).
 */

export const metadata: Metadata = { title: "UI" };

type SampleRow = {
  supplier: string;
  type: "manufacturer" | "distributor";
  document: string;
  status: DocumentStatus;
  expires: string;
};

// Fictional rows, for looks only.
const ROWS: SampleRow[] = [
  {
    supplier: "Frutas del Sur",
    type: "manufacturer",
    document: "Certificado GFSI (SQF)",
    status: "current",
    expires: "2027-03-14",
  },
  {
    supplier: "Distribuidora Atlántico",
    type: "distributor",
    document: "Carta de garantía",
    status: "expiring",
    expires: "2026-10-08",
  },
  {
    supplier: "Aditivos Boricua",
    type: "manufacturer",
    document: "Declaración de alérgenos",
    status: "missing",
    expires: "—",
  },
];

const SWATCHES = [
  ["Navy", "bg-brand-navy"],
  ["Blue", "bg-brand-blue"],
  ["Sand", "bg-brand-sand"],
  ["Olive", "bg-brand-olive"],
  ["Background", "bg-background border"],
  ["Card", "bg-card border"],
  ["Muted", "bg-muted"],
  ["Border", "bg-border"],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function UiReviewPage() {
  if (process.env.NODE_ENV === "production" && process.env.SHOW_UI_REVIEW !== "true") notFound();
  const t = await getTranslations("review");

  const columns: Column<SampleRow>[] = [
    { key: "supplier", header: t("colSupplier"), cell: (r) => r.supplier, primary: true },
    { key: "type", header: t("colType"), cell: (r) => t(r.type) },
    { key: "document", header: t("colDocument"), cell: (r) => r.document },
    { key: "status", header: t("colStatus"), cell: (r) => <StatusPill status={r.status} /> },
    { key: "expires", header: t("colExpires"), cell: (r) => <span className="tabular-nums">{r.expires}</span> },
  ];

  return (
    <main id="main" className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <SampleDataBadge />
            <LanguageSwitch />
          </>
        }
      />

      <Section title={t("colors")}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map(([name, cls]) => (
            <li key={name} className="grid gap-1.5">
              <span className={`h-12 rounded-lg ${cls}`} />
              <span className="text-sm text-muted-foreground">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("typography")}>
        <p className="text-3xl font-bold tracking-tight">{t("headingSample")}</p>
        <p className="text-xl font-semibold">{t("headingSample")}</p>
        <p className="max-w-prose">{t("bodySample")}</p>
        <p className="text-sm text-muted-foreground">{t("bodySample")}</p>
      </Section>

      <Section title={t("buttons")}>
        <div className="flex flex-wrap gap-2">
          <Button>
            <Plus aria-hidden />
            {t("primary")}
          </Button>
          <Button variant="secondary">{t("secondary")}</Button>
          <Button variant="outline">{t("outline")}</Button>
          <Button variant="ghost">{t("ghost")}</Button>
          <Button variant="destructive">{t("destructive")}</Button>
          <Button disabled>{t("primary")}</Button>
        </div>
      </Section>

      <Section title={t("statuses")}>
        <div className="flex flex-wrap gap-2">
          <StatusPill status="current" />
          <StatusPill status="expiring" />
          <StatusPill status="expired" />
          <StatusPill status="missing" />
        </div>
      </Section>

      <Section title={t("forms")}>
        <form className="grid max-w-md gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ui-supplier">{t("supplierName")}</Label>
            <Input id="ui-supplier" placeholder={t("supplierPlaceholder")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ui-type">{t("partyType")}</Label>
            <Select
              defaultValue="manufacturer"
              items={{ manufacturer: t("manufacturer"), distributor: t("distributor") }}
            >
              <SelectTrigger id="ui-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manufacturer">{t("manufacturer")}</SelectItem>
                <SelectItem value="distributor">{t("distributor")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ui-notes">{t("notes")}</Label>
            <Textarea id="ui-notes" rows={3} />
          </div>
        </form>
      </Section>

      <Section title={t("table")}>
        <ResponsiveTable columns={columns} rows={ROWS} rowKey={(r) => r.supplier} caption={t("table")} />
      </Section>

      <Section title={t("empty")}>
        <EmptyState icon={Inbox} title={t("headingSample")} body={t("bodySample")} />
      </Section>
    </main>
  );
}
