import { CircleAlert, CircleCheck, CircleX, Clock, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { documentHref, uploadHref } from "@/components/app-shell/nav-items";
import { DEFAULT_CATALOG, findType } from "@/domain/catalog";
import type { RequirementResult, RequirementStatus } from "@/domain/status";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { SourceView } from "@/server/supplier-detail";
import { buildMatrix, byDocument, type MatrixView } from "@/server/supplier-matrix";

const MARK: Record<RequirementStatus, { Icon: LucideIcon; tone: string }> = {
  current: { Icon: CircleCheck, tone: "text-status-current" },
  expiring: { Icon: Clock, tone: "text-status-expiring" },
  expired: { Icon: CircleX, tone: "text-status-missing" },
  missing: { Icon: CircleAlert, tone: "text-status-missing" },
};
const STATUSES: RequirementStatus[] = ["current", "expiring", "expired", "missing"];

/**
 * Materials × documents on the supplier page, like the demo: "Por ingrediente" (a row per
 * material) or "Por documento" (transposed), and "Solo incompletos". The choice lives in the
 * URL (?vista=documento&incompletos=1), so it works without JavaScript and can be shared.
 */
export async function SupplierMatrix({
  company,
  partyId,
  sources,
  view,
  incompleteOnly,
  canUpload,
  pageHref,
  lang,
}: {
  company: string;
  partyId: string;
  sources: SourceView[];
  view: MatrixView;
  incompleteOnly: boolean;
  canUpload: boolean;
  /** This supplier page, to build the view links. */
  pageHref: string;
  lang: Locale;
}) {
  const [t, tStatus] = await Promise.all([getTranslations("supplier.matrix"), getTranslations("status")]);
  const matrix = buildMatrix(sources);
  const docName = (code: string) => findType(DEFAULT_CATALOG, code)?.name[lang] ?? code;
  const materialName = (s: SourceView) => `${s.material.name} (${s.material.code})`;

  const href = (v: MatrixView, incomplete: boolean) => {
    const q = new URLSearchParams();
    if (v === "documento") q.set("vista", "documento");
    if (incomplete) q.set("incompletos", "1");
    const query = q.toString();
    return `${pageHref}${query ? `?${query}` : ""}#matriz`;
  };

  function Cell({ result, source, code }: { result: RequirementResult | null; source: SourceView; code: string }) {
    if (!result) {
      return (
        <td className="px-3 py-2 text-center text-muted-foreground">
          <span aria-hidden>—</span>
          <span className="sr-only">{t("notApplicable")}</span>
        </td>
      );
    }
    const { Icon, tone } = MARK[result.status];
    const label = t("cellLabel", {
      material: materialName(source),
      document: docName(code),
      status: tStatus(result.status),
    });
    const mark = <Icon aria-hidden className={cn("mx-auto size-5", tone)} />;
    // The document when there is one; otherwise, the upload form already filled in.
    const target = result.document
      ? documentHref(company, result.document.id)
      : canUpload
        ? uploadHref(company, { supplier: partyId, para: source.id, tipo: code })
        : null;
    return (
      <td className="px-3 py-2 text-center" data-status={result.status}>
        {target ? (
          <Link
            href={target}
            aria-label={result.document ? label : `${label} · ${t("upload")}`}
            title={label}
            className="inline-flex rounded-md p-1 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {mark}
          </Link>
        ) : (
          <span title={label}>
            {mark}
            <span className="sr-only">{label}</span>
          </span>
        )}
      </td>
    );
  }

  const pending = (open: number, total: number) =>
    open ? (
      <span className="font-semibold text-status-missing">{t("of", { open, total })}</span>
    ) : (
      <span className="text-status-current">{t("complete")}</span>
    );

  const materialRows = matrix.rows.filter((r) => !incompleteOnly || r.open > 0);
  const documentRows = byDocument(matrix).filter((d) => !incompleteOnly || d.open > 0);
  const empty = view === "ingrediente" ? !materialRows.length : !documentRows.length;

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
    );
  const stickyTh = "sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium";

  return (
    <section id="matriz" className="grid scroll-mt-20 grid-cols-1 gap-3" aria-labelledby="matriz-title">
      <div>
        <h2 id="matriz-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>

      {!matrix.rows.length ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <>
          <nav aria-label={t("views")} className="flex flex-wrap items-center gap-2">
            <Link
              href={href("ingrediente", incompleteOnly)}
              scroll={false}
              aria-current={view === "ingrediente" ? "true" : undefined}
              className={chip(view === "ingrediente")}
            >
              {t("byMaterial")}
            </Link>
            <Link
              href={href("documento", incompleteOnly)}
              scroll={false}
              aria-current={view === "documento" ? "true" : undefined}
              className={chip(view === "documento")}
            >
              {t("byDocument")}
            </Link>
            <Link
              href={href(view, !incompleteOnly)}
              scroll={false}
              aria-current={incompleteOnly ? "true" : undefined}
              className={cn(chip(incompleteOnly), "sm:ml-auto")}
            >
              {t("incompleteOnly")}
            </Link>
          </nav>

          {empty ? (
            <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              {t("allComplete")}
            </p>
          ) : (
            // Wide tables scroll sideways inside their own box; the first column stays put.
            <div className="overflow-x-auto rounded-xl border bg-card">
              {view === "ingrediente" ? (
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("captionMaterial")}</caption>
                  <thead className="border-b">
                    <tr>
                      <th scope="col" className={stickyTh}>
                        {t("material")}
                      </th>
                      {matrix.documents.map((code) => (
                        <th key={code} scope="col" className="min-w-28 px-3 py-2 text-center font-medium">
                          {docName(code)}
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        {t("pending")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialRows.map((row) => (
                      <tr key={row.source.id} className="border-b last:border-0">
                        <th scope="row" className={cn(stickyTh, "min-w-44")}>
                          <span className="block font-semibold">{row.source.material.name}</span>
                          <span className="block text-xs font-normal text-muted-foreground">
                            {row.source.material.code}
                          </span>
                        </th>
                        {matrix.documents.map((code) => (
                          <Cell key={code} result={row.cells[code]} source={row.source} code={code} />
                        ))}
                        <td className="px-3 py-2 whitespace-nowrap">{pending(row.open, row.required)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("captionDocument")}</caption>
                  <thead className="border-b">
                    <tr>
                      <th scope="col" className={stickyTh}>
                        {t("document")}
                      </th>
                      {matrix.rows.map((row) => (
                        <th key={row.source.id} scope="col" className="min-w-24 px-3 py-2 text-center font-medium">
                          <span className="block text-xs text-muted-foreground">{row.source.material.code}</span>
                          <span className="block">{row.source.material.name}</span>
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        {t("missingIn")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentRows.map((doc) => (
                      <tr key={doc.code} className="border-b last:border-0">
                        <th scope="row" className={cn(stickyTh, "min-w-44 font-semibold")}>
                          {docName(doc.code)}
                        </th>
                        {matrix.rows.map((row) => (
                          <Cell key={row.source.id} result={row.cells[doc.code]} source={row.source} code={doc.code} />
                        ))}
                        <td className="px-3 py-2 whitespace-nowrap">{pending(doc.open, doc.required)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          <ul aria-label={t("legend")} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {STATUSES.map((s) => {
              const { Icon, tone } = MARK[s];
              return (
                <li key={s} className="inline-flex items-center gap-1">
                  <Icon aria-hidden className={cn("size-4", tone)} />
                  {tStatus(s)}
                </li>
              );
            })}
            <li className="inline-flex items-center gap-1">
              <span aria-hidden>—</span>
              {t("notApplicable")}
            </li>
          </ul>
        </>
      )}

      {matrix.inactive ? (
        <p className="text-xs text-muted-foreground">{t("inactive", { count: matrix.inactive })}</p>
      ) : null}
    </section>
  );
}
