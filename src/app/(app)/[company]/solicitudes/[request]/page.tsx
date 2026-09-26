import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { documentHref, supplierHref } from "@/components/app-shell/nav-items";
import { DocumentStateBadge } from "@/components/documents/document-state-badge";
import { requestsHref } from "@/components/requests/hrefs";
import { ItemStatusBadge, RequestStatusBadge } from "@/components/requests/request-badges";
import { LinkPanel, ReasonForm } from "@/components/requests/request-controls";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { SectionGate } from "@/components/section-gate";
import { getRequestContext } from "@/server/context";
import { cancelRequestAction, newLinkAction, sendRequestAction, waiveItemAction } from "@/server/request-actions";
import { getRequest, type RequestItemView } from "@/server/requests";

type Props = PageProps<"/[company]/solicitudes/[request]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { company, request } = await params;
  const r = await getRequest(await getRequestContext(company), decodeURIComponent(request)).catch(() => null);
  const t = await getTranslations("requests");
  return { title: r ? `${t("caption")} · ${r.partyName}` : t("detail.notFoundTitle") };
}

export default async function Page({ params }: Props) {
  const { company, request } = await params;
  return (
    <SectionGate company={company} section="requests" permission="requests.send">
      <RequestPage company={company} id={decodeURIComponent(request)} />
    </SectionGate>
  );
}

async function RequestPage({ company, id }: { company: string; id: string }) {
  const ctx = await getRequestContext(company);
  const [r, t, tStatus, tReq, format] = await Promise.all([
    getRequest(ctx, id),
    getTranslations("requests.detail"),
    getTranslations("requests"),
    getTranslations("requirements.name"),
    getFormatter(),
  ]);
  if (!r) notFound();

  const day = (iso: string) => format.dateTime(new Date(`${iso.slice(0, 10)}T12:00:00Z`), { dateStyle: "medium" });
  const moment = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const open = r.state !== "cancelled" && r.status !== "complete";

  const columns: Column<RequestItemView>[] = [
    {
      key: "requirement",
      header: t("col.requirement"),
      primary: true,
      className: "min-w-40 whitespace-normal",
      cell: (i) => <span className="font-semibold">{tReq(i.code)}</span>,
    },
    {
      key: "appliesTo",
      header: t("col.appliesTo"),
      className: "whitespace-normal",
      cell: (i) => i.subject.material ?? i.subject.site ?? i.subject.partyName,
    },
    {
      key: "status",
      header: t("col.status"),
      className: "whitespace-normal",
      cell: (i) => (
        <span className="grid justify-items-end gap-1 md:justify-items-start">
          <ItemStatusBadge status={i.status} />
          {i.rejectionReason && i.status === "rejected" ? (
            <span className="text-xs text-muted-foreground">{i.rejectionReason}</span>
          ) : null}
          {i.waivedReason ? <span className="text-xs text-muted-foreground">{i.waivedReason}</span> : null}
        </span>
      ),
    },
    {
      key: "documents",
      header: t("col.documents"),
      className: "whitespace-normal",
      cell: (i) =>
        i.documents.length ? (
          <ul className="grid gap-1">
            {i.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-end gap-2 md:justify-start">
                <Link href={documentHref(company, d.id)} className="text-primary hover:underline">
                  {d.fileName ?? day(d.receivedOn)}
                </Link>
                <DocumentStateBadge state={d.state} />
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">{t("noDocuments")}</span>
        ),
    },
  ];

  const waivable =
    r.state !== "cancelled" ? r.items.filter((i) => i.status === "requested" || i.status === "rejected") : [];

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-3 border-b pb-5">
        <Link
          href={requestsHref(company)}
          className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          <Link href={supplierHref(company, r.partyId)} className="hover:underline">
            {r.partyName}
          </Link>
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <RequestStatusBadge status={r.status} />
          {r.contact ? <span>{t("to", { name: r.contact.name, email: r.contact.email })}</span> : null}
        </div>
        <ul className="grid gap-1 text-sm text-muted-foreground">
          <li>{t("due", { date: day(r.dueOn) })}</li>
          <li>{t("createdBy", { name: r.createdByName, date: moment(r.createdAt) })}</li>
          {r.sentAt && r.sentByName ? <li>{t("sentBy", { name: r.sentByName, date: moment(r.sentAt) })}</li> : null}
          {r.cancelledReason ? <li>{t("cancelled", { reason: r.cancelledReason })}</li> : null}
        </ul>
        {r.message ? (
          <blockquote className="border-l-4 border-primary/40 pl-3 text-sm">
            <span className="sr-only">{t("message")}: </span>
            {r.message}
          </blockquote>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="items-title" className="grid content-start gap-3">
          <h2 id="items-title" className="text-lg font-semibold">
            {t("items")}
          </h2>
          <ResponsiveTable columns={columns} rows={r.items} rowKey={(i) => i.id} caption={t("itemsCaption")} />
          {waivable.map((i) => (
            <details key={i.id} className="rounded-lg border bg-card p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                {t("waive")}: {tReq(i.code)}
                {i.subject.material ? ` · ${i.subject.material}` : ""}
              </summary>
              <div className="mt-3">
                <ReasonForm
                  action={waiveItemAction.bind(null, company, r.id, i.id)}
                  id={`waive-${i.id}`}
                  label={t("waiveReason")}
                  hint={t("waiveHint")}
                  submit={t("confirmWaive")}
                />
              </div>
            </details>
          ))}
        </section>

        <div className="grid content-start gap-6">
          <Panel title={t("link.title")}>
            <p className="text-sm text-muted-foreground">{t("link.hint")}</p>
            <p className="text-sm">
              {r.link
                ? `${t("link.active", { date: day(r.link.expiresOn) })} ${
                    r.link.lastUsedAt ? t("link.lastUsed", { date: moment(r.link.lastUsedAt) }) : t("link.neverUsed")
                  }`
                : t("link.none")}
            </p>
            <LinkPanel
              company={ctx.company.name}
              state={r.state}
              send={sendRequestAction.bind(null, company, r.id)}
              newLink={newLinkAction.bind(null, company, r.id)}
              canSend={open}
              canNewLink={open && r.state === "sent"}
            />
          </Panel>

          {r.state !== "cancelled" && r.status !== "complete" ? (
            <Panel title={t("cancel")}>
              <ReasonForm
                action={cancelRequestAction.bind(null, company, r.id)}
                id="cancel-reason"
                label={t("cancelReason")}
                submit={t("confirmCancel")}
                destructive
              />
            </Panel>
          ) : null}

          <Panel title={t("emails")}>
            {r.emails.length ? (
              <ul className="grid gap-2 text-sm">
                {r.emails.map((e) => (
                  <li key={e.providerId} className="grid gap-0.5">
                    <span className="font-medium">{tStatus(`log.template.${e.template}`)}</span>
                    <span className="text-xs break-all text-muted-foreground">
                      {moment(e.at)} · {e.toEmail} · {tStatus(`log.status.${e.status as "logged"}`)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("emailsEmpty")}</p>
            )}
          </Panel>

          <Panel title={t("activity")}>
            <ol className="grid gap-2 text-sm">
              {r.events.map((e, n) => (
                <li key={`${e.at}-${n}`} className="grid gap-0.5">
                  <span>
                    <span className="font-medium">{e.actorName}</span> ·{" "}
                    {t(`action.${e.action.replace(".", "_") as "request_created"}`)}
                  </span>
                  <time dateTime={e.at} className="text-xs text-muted-foreground">
                    {moment(e.at)}
                  </time>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
