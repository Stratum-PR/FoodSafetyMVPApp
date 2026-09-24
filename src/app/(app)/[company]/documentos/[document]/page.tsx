import { ArrowLeft, ArrowRight, FileText, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { documentHref, navHref, supplierHref } from "@/components/app-shell/nav-items";
import { DocumentStateBadge } from "@/components/documents/document-state-badge";
import { ReviewForm } from "@/components/documents/review-form";
import { type Column, ResponsiveTable } from "@/components/responsive-table";
import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import { isLocale, type Locale } from "@/i18n/config";
import { getRequestContext } from "@/server/context";
import { reviewDocumentAction } from "@/server/document-actions";
import { type DocumentRow, filterDocuments } from "@/server/document-list";
import { getDocument, listDocuments } from "@/server/documents";

type Props = PageProps<"/[company]/documentos/[document]">;

async function typeName(code: string): Promise<string> {
  const locale = await getLocale();
  const lang: Locale = isLocale(locale) ? locale : "es";
  return findType(DEFAULT_CATALOG, code)?.name[lang] ?? code;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { company, document } = await params;
  const doc = await getDocument(await getRequestContext(company), decodeURIComponent(document));
  return {
    title: doc
      ? `${await typeName(doc.typeCode)} · ${doc.partyName}`
      : (await getTranslations("document"))("notFoundTitle"),
  };
}

export default async function Page({ params }: Props) {
  const { company, document } = await params;
  const id = decodeURIComponent(document);
  const ctx = await getRequestContext(company);
  const [doc, rows, t, format] = await Promise.all([
    getDocument(ctx, id),
    listDocuments(ctx),
    getTranslations("document"),
    getFormatter(),
  ]);
  if (!doc) notFound();

  const name = await typeName(doc.typeCode);
  const date = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "medium" });
  // The next document in the review queue that this user can act on (not their own upload).
  const next = filterDocuments(rows, { tab: "revisar", q: "" }).find(
    (r) => r.id !== doc.id && r.uploadedBy !== ctx.actor.userId,
  );
  const queueHref = navHref(company, "documentos");
  const fileHref = `${documentHref(company, doc.id)}/archivo`;

  const historyColumns: Column<DocumentRow>[] = [
    {
      key: "version",
      header: t("history.version"),
      primary: true,
      cell: (v) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          {v.id === doc.id ? (
            <span>{date(v.issuedOn ?? v.receivedOn)}</span>
          ) : (
            <Link href={documentHref(company, v.id)} className="font-semibold text-primary hover:underline">
              {date(v.issuedOn ?? v.receivedOn)}
            </Link>
          )}
          {v.state === "accepted" ? (
            <span className="rounded-full border border-status-current bg-status-current-bg px-2 py-0.5 text-xs font-semibold text-status-current">
              {t("history.active")}
            </span>
          ) : null}
          {v.id === doc.id ? (
            <span className="text-xs font-normal text-muted-foreground">{t("history.viewing")}</span>
          ) : null}
        </span>
      ),
    },
    { key: "received", header: t("history.received"), cell: (v) => date(v.receivedOn), className: "tabular-nums" },
    {
      key: "expires",
      header: t("history.expires"),
      cell: (v) => (v.expires ? date(v.expires) : "—"),
      className: "tabular-nums",
    },
    { key: "state", header: t("history.state"), cell: (v) => <DocumentStateBadge state={v.state} /> },
    { key: "uploadedBy", header: t("history.uploadedBy"), cell: (v) => v.uploadedByName },
    { key: "reviewedBy", header: t("history.reviewedBy"), cell: (v) => v.reviewedByName ?? "—" },
  ];

  const expiresNote = !doc.expires
    ? t("expiresNever")
    : doc.printedExpiry
      ? t("expiresPrinted")
      : t("expiresDefault", { months: doc.validityMonths ?? 12 });

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-3 border-b pb-5">
        <Link
          href={queueHref}
          className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{name}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <DocumentStateBadge state={doc.state} />
          <Link href={supplierHref(company, doc.partyId)} className="font-medium text-primary hover:underline">
            {doc.partyName}
          </Link>
          {doc.materialName ? <span className="text-muted-foreground">· {doc.materialName}</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid grid-cols-1 content-start gap-6">
          <dl
            aria-label={t("facts")}
            className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2"
          >
            <Fact label={t("supplier")}>{doc.partyName}</Fact>
            <Fact label={t("about")}>{doc.materialName ?? t("supplierItself")}</Fact>
            {doc.lotCode ? <Fact label={t("lot")}>{doc.lotCode}</Fact> : null}
            <Fact label={t("issued")}>{doc.issuedOn ? date(doc.issuedOn) : t("notSet")}</Fact>
            <Fact label={t("received")}>{date(doc.receivedOn)}</Fact>
            <Fact label={t("expires")}>
              {doc.expires ? date(doc.expires) : "—"}
              <span className="block text-xs font-normal text-muted-foreground">{expiresNote}</span>
            </Fact>
            <Fact label={t("uploadedBy")}>{doc.uploadedByName}</Fact>
          </dl>

          {doc.file ? (
            <section aria-label={t("file")} className="grid gap-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 font-medium break-all">
                  {t("fileView.info", {
                    name: doc.file.name,
                    size:
                      doc.file.size < 1024 * 1024
                        ? `${format.number(Math.max(1, Math.round(doc.file.size / 1024)))} KB`
                        : `${format.number(doc.file.size / 1024 / 1024, { maximumFractionDigits: 1 })} MB`,
                  })}
                </span>
                <span className="flex gap-3 font-semibold">
                  <a href={fileHref} target="_blank" rel="noopener" className="text-primary hover:underline">
                    {t("fileView.open")}
                  </a>
                  <a href={`${fileHref}?descargar=1`} className="text-primary hover:underline">
                    {t("fileView.download")}
                  </a>
                </span>
              </div>
              {doc.file.contentType === "application/pdf" ? (
                <iframe
                  src={fileHref}
                  title={t("fileView.preview", { name: doc.file.name })}
                  className="h-[70vh] min-h-96 w-full rounded-lg border bg-muted"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- a private, permission-checked file, not a static asset
                <img
                  src={fileHref}
                  alt={t("fileView.preview", { name: doc.file.name })}
                  className="max-h-[70vh] w-full rounded-lg border bg-muted object-contain"
                />
              )}
            </section>
          ) : (
            <section
              aria-label={t("file")}
              className="grid place-items-center gap-2 rounded-xl border border-dashed bg-card px-6 py-12 text-center"
            >
              <FileText aria-hidden className="size-8 text-muted-foreground" />
              <p className="max-w-sm text-sm text-muted-foreground">{t("filePending")}</p>
            </section>
          )}
        </div>

        <section className="grid content-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="text-lg font-semibold">{t("review.title")}</h2>
          {doc.state === "pending_review" && doc.reviewDenial === null ? (
            <ReviewForm action={reviewDocumentAction.bind(null, company, doc.id)} />
          ) : doc.state === "pending_review" ? (
            <Notice>{t(`denial.${doc.reviewDenial!}`)}</Notice>
          ) : (
            <div role="status" className="grid gap-2 text-sm">
              {doc.state === "superseded" ? (
                <p>{t("review.superseded")}</p>
              ) : doc.reviewedOn ? (
                <p>
                  {t(doc.state === "accepted" ? "review.accepted" : "review.rejected", {
                    name: doc.reviewedByName ?? "",
                    date: date(doc.reviewedOn),
                  })}
                </p>
              ) : null}
              {doc.rejectionReason ? (
                <blockquote className="border-l-4 border-status-missing pl-3 text-muted-foreground">
                  {doc.rejectionReason}
                </blockquote>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-sm font-semibold">
            {next ? (
              <Link
                href={documentHref(company, next.id)}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {t("review.next")}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            ) : null}
            <Link href={queueHref} className="text-primary hover:underline">
              {t("review.backToQueue")}
            </Link>
          </div>
        </section>
      </div>

      <section className="grid grid-cols-1 gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("history.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("history.hint")}</p>
        </div>
        {doc.versions.length > 1 ? (
          <ResponsiveTable
            columns={historyColumns}
            rows={doc.versions}
            rowKey={(v) => v.id}
            caption={t("history.caption")}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("history.only")}</p>
        )}
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}
