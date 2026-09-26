import { Mail, Plus, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { emailLogHref, newRequestHref, requestHref, requestsHref } from "@/components/requests/hrefs";
import { RequestStatusBadge } from "@/components/requests/request-badges";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { SectionGate } from "@/components/section-gate";
import { sectionText } from "@/components/section-placeholder";
import { buttonVariants } from "@/components/ui/button";
import { findProgram } from "@/domain/programs";
import type { BatchStatus } from "@/domain/requests";
import { isLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { getRequestContext } from "@/server/context";
import { listRequests, type RequestRow } from "@/server/requests";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await sectionText("requests")).title };
}

const STATUSES: BatchStatus[] = [
  "overdue",
  "rejected_items",
  "awaiting_review",
  "partially_received",
  "sent",
  "draft",
  "complete",
  "cancelled",
];

export default async function Page({ params, searchParams }: PageProps<"/[company]/solicitudes">) {
  const [{ company }, query] = await Promise.all([params, searchParams]);
  return (
    <SectionGate company={company} section="requests" permission="requests.send">
      <Requests company={company} estado={typeof query.estado === "string" ? query.estado : ""} />
    </SectionGate>
  );
}

async function Requests({ company, estado }: { company: string; estado: string }) {
  const ctx = await getRequestContext(company);
  const [rows, text, t, format, locale] = await Promise.all([
    listRequests(ctx),
    sectionText("requests"),
    getTranslations("requests"),
    getFormatter(),
    getLocale(),
  ]);
  const lang = isLocale(locale) ? locale : "es";
  const status = (STATUSES as string[]).includes(estado) ? (estado as BatchStatus) : null;
  const shown = status ? rows.filter((r) => r.status === status) : rows;
  const date = (iso: string) => (
    <time dateTime={iso}>{format.dateTime(new Date(`${iso.slice(0, 10)}T12:00:00Z`), { dateStyle: "medium" })}</time>
  );
  const moment = (iso: string) => (
    <time dateTime={iso}>{format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" })}</time>
  );
  const counts = new Map<BatchStatus, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);

  const columns: Column<RequestRow>[] = [
    {
      key: "supplier",
      header: t("col.supplier"),
      primary: true,
      className: "min-w-40 whitespace-normal",
      cell: (r) => (
        <span className="grid gap-0.5">
          <Link href={requestHref(company, r.id)} className="font-semibold text-primary hover:underline">
            {r.partyName}
          </Link>
          {r.contact ? (
            <span className="text-xs font-normal break-all text-muted-foreground">
              {r.contact.name} · {r.contact.email}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "progress",
      header: t("col.progress"),
      className: "whitespace-normal",
      cell: (r) => (
        <span className="grid gap-0.5">
          <span>{t("progress", { accepted: r.progress.accepted, requested: r.progress.requested })}</span>
          <span className="text-xs text-muted-foreground">{t("received", { received: r.progress.received })}</span>
        </span>
      ),
    },
    {
      key: "reason",
      header: t("col.reason"),
      className: "min-w-32 whitespace-normal",
      cell: (r) => r.programs.map((p) => findProgram(p).name[lang]).join(", "),
    },
    {
      key: "dates",
      header: t("col.dates"),
      className: "tabular-nums",
      cell: (r) => (
        <span className="grid gap-0.5">
          <span>{r.sentAt ? date(r.sentAt) : t("notSent")}</span>
          <span className="text-xs text-muted-foreground">{date(r.dueOn)}</span>
        </span>
      ),
    },
    { key: "activity", header: t("col.activity"), className: "tabular-nums", cell: (r) => moment(r.lastActivityAt) },
    {
      key: "reminder",
      header: t("col.reminder"),
      className: "whitespace-normal",
      cell: (r) =>
        r.nextReminder ? (
          <span className="grid gap-0.5">
            {date(r.nextReminder.on)}
            <span className="text-xs text-muted-foreground">
              {t(`reminderKind.${r.nextReminder.kind as "request_due_soon"}`)}
            </span>
          </span>
        ) : (
          t("noReminder")
        ),
    },
    { key: "status", header: t("col.status"), cell: (r) => <RequestStatusBadge status={r.status} /> },
    {
      key: "action",
      header: t("col.action"),
      cell: (r) => (
        <Link href={requestHref(company, r.id)} className={buttonVariants({ size: "sm", variant: "outline" })}>
          {t("open")}
        </Link>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title={text.title}
        description={text.description}
        actions={
          <>
            <Link href={emailLogHref(company)} className={buttonVariants({ variant: "outline" })}>
              <Mail aria-hidden />
              {t("emailLog")}
            </Link>
            <Link href={newRequestHref(company)} className={buttonVariants()}>
              <Plus aria-hidden />
              {t("new")}
            </Link>
          </>
        }
      />

      {rows.length ? (
        <>
          <nav aria-label={t("filterStatus")}>
            <ul className="flex flex-wrap gap-2">
              {[null, ...STATUSES.filter((s) => counts.has(s))].map((s) => {
                const active = s === status;
                return (
                  <li key={s ?? "all"}>
                    <Link
                      href={requestsHref(company, s ?? undefined)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
                        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      {s ? t(`status.${s}`) : t("all")}
                      <span className="tabular-nums opacity-80">{s ? counts.get(s) : rows.length}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t("count", { count: shown.length })}
          </p>
          {shown.length ? (
            <ResponsiveTable columns={columns} rows={shown} rowKey={(r) => r.id} caption={t("caption")} />
          ) : (
            <EmptyState icon={Send} title={t("emptyFilter")} />
          )}
        </>
      ) : (
        <EmptyState
          icon={Send}
          title={t("empty")}
          body={t("emptyBody")}
          action={
            <Link href={newRequestHref(company)} className={buttonVariants()}>
              <Plus aria-hidden />
              {t("new")}
            </Link>
          }
        />
      )}
    </div>
  );
}
