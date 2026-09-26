import { ArrowLeft, Info, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requestHref, requestsHref } from "@/components/requests/hrefs";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { SectionGate } from "@/components/section-gate";
import { getRequestContext } from "@/server/context";
import { type EmailLogRow, listEmailLog } from "@/server/notifications";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("requests.log"))("title") };
}

/** /{company}/solicitudes/correos: every email sent to suppliers, the proof they were notified. */
export default async function Page({ params }: PageProps<"/[company]/solicitudes/correos">) {
  const { company } = await params;
  return (
    <SectionGate company={company} section="requests" permission="requests.send">
      <EmailLog company={company} />
    </SectionGate>
  );
}

async function EmailLog({ company }: { company: string }) {
  const ctx = await getRequestContext(company);
  const [rows, t, tBack, format] = await Promise.all([
    listEmailLog(ctx),
    getTranslations("requests.log"),
    getTranslations("requests.detail"),
    getFormatter(),
  ]);
  const moment = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const columns: Column<EmailLogRow>[] = [
    {
      key: "template",
      header: t("col.template"),
      primary: true,
      cell: (e) =>
        e.record.kind === "request" ? (
          <Link href={requestHref(company, e.record.id)} className="font-semibold text-primary hover:underline">
            {t(`template.${e.template}`)}
          </Link>
        ) : (
          <span className="font-semibold">{t(`template.${e.template}`)}</span>
        ),
    },
    {
      key: "to",
      header: t("col.to"),
      className: "whitespace-normal",
      cell: (e) => (
        <span className="grid gap-0.5">
          <span>{e.partyName}</span>
          <span className="text-xs break-all text-muted-foreground">
            {e.contactName} · {e.toEmail}
          </span>
        </span>
      ),
    },
    {
      key: "at",
      header: t("col.at"),
      className: "tabular-nums",
      cell: (e) => <time dateTime={e.at}>{moment(e.at)}</time>,
    },
    { key: "status", header: t("col.status"), cell: (e) => t(`status.${e.status}`) },
    {
      key: "id",
      header: t("col.id"),
      cell: (e) => <span className="font-mono text-xs break-all">{e.providerId}</span>,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      <Link
        href={requestsHref(company)}
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {tBack("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <p className="flex gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t("outbox")}
      </p>
      {rows.length ? (
        <ResponsiveTable columns={columns} rows={rows} rowKey={(e) => e.id} caption={t("caption")} />
      ) : (
        <EmptyState icon={Mail} title={t("empty")} />
      )}
    </div>
  );
}
