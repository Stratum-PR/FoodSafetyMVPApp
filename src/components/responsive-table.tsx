import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type Column<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** The column that titles each card on a phone. Exactly one column should set it. */
  primary?: boolean;
  className?: string;
  /** Makes the header a link that sorts by this column. dir is set on the column currently sorted. */
  sort?: { href: string; dir: "asc" | "desc" | null };
};

/** An invisible link over the whole row. Hidden from keyboards and screen readers, which use the real link. */
function RowCover({ href }: { href: string }) {
  return <Link href={href} aria-hidden tabIndex={-1} className="absolute inset-0" />;
}

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

function Header<Row>({ column }: { column: Column<Row> }) {
  if (!column.sort) return column.header;
  const { href, dir } = column.sort;
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <Link
      href={href}
      scroll={false}
      className="-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {column.header}
      <Icon aria-hidden className={dir ? "size-3.5" : "size-3.5 opacity-40"} />
    </Link>
  );
}

/**
 * A table on tablets and computers; a list of cards on phones, where wide tables don't fit.
 * Same data and columns in both, so screens don't build two layouts by hand. Sortable
 * headers are links (the order lives in the URL); on phones the page gives its own sort control.
 */
export function ResponsiveTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  rowHref,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  caption?: string;
  /**
   * Makes the whole row (or card) open this page. The primary cell should still hold a real
   * link to it: that one is for keyboards and screen readers; the row cover is for the mouse.
   */
  rowHref?: (row: Row) => string;
}) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary);

  return (
    <>
      <div className="hidden rounded-xl border bg-card md:block">
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={c.className}
                  aria-sort={c.sort?.dir ? ARIA_SORT[c.sort.dir] : c.sort ? "none" : undefined}
                >
                  <Header column={c} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} className={rowHref ? "relative cursor-pointer hover:bg-muted/50" : undefined}>
                {columns.map((c, i) => (
                  <TableCell key={c.key} className={c.className}>
                    {rowHref && i === 0 ? <RowCover href={rowHref(row)} /> : null}
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="grid gap-3 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className={
              rowHref
                ? "relative cursor-pointer rounded-xl border bg-card p-4 hover:border-primary"
                : "rounded-xl border bg-card p-4"
            }
          >
            {rowHref ? <RowCover href={rowHref(row)} /> : null}
            <div className="font-semibold">{primary.cell(row)}</div>
            <dl className="mt-2 grid gap-1.5 text-sm">
              {rest.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{c.header}</dt>
                  <dd className="text-right">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
