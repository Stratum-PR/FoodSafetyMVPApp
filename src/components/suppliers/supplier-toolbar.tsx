"use client";

import { ArrowDownUp, ListFilter, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  APPROVAL_FILTERS,
  filtersQuery,
  SORT_KEYS,
  type SortDir,
  type SortKey,
  STAGE_FILTERS,
  type SupplierFilters,
  sortParam,
  TYPE_FILTERS,
} from "@/server/supplier-filters";

const SEARCH_DELAY_MS = 350;

/**
 * Search, filters and (on phones) sort. Every change applies at once: filters only read, so
 * there is nothing to confirm. The state lives in the URL, so a filtered list can be shared.
 * Search waits until typing pauses, so it asks for one list, not one per letter.
 */
export function SupplierToolbar({ action, filters }: { action: string; filters: SupplierFilters }) {
  const t = useTranslations("suppliers");
  const tType = useTranslations("partyType");
  const tApproval = useTranslations("approval");
  const tLifecycle = useTranslations("lifecycle");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Any filter change goes back to page 1.
  const hrefFor = (change: Partial<SupplierFilters>) => `${action}${filtersQuery({ ...filters, page: 1, ...change })}`;
  const go = (change: Partial<SupplierFilters>) =>
    startTransition(() => router.replace(hrefFor(change), { scroll: false }));

  useEffect(() => () => clearTimeout(timer.current), []);
  // Back/forward or a chip changed the search: show it, unless the person is typing.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== input.current) setQ(filters.q);
  }, [filters.q]);
  function onSearch(value: string) {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: value.trim() }), SEARCH_DELAY_MS);
  }

  const typeLabel = (v: SupplierFilters["type"]) => (v === "all" ? t("allTypes") : tType(v));
  const approvalLabel = (v: SupplierFilters["approval"]) => (v === "all" ? t("allApprovals") : tApproval(v));
  const stageLabel = (v: SupplierFilters["stage"]) =>
    v === "all" ? t("allStages") : v === "active" ? t("activeStage") : tLifecycle(v);

  const chips = [
    filters.type !== "all" && {
      key: "type",
      label: `${t("type")}: ${typeLabel(filters.type)}`,
      clear: { type: "all" },
    },
    filters.approval !== "all" && {
      key: "approval",
      label: `${t("approval")}: ${approvalLabel(filters.approval)}`,
      clear: { approval: "all" },
    },
    filters.stage !== "all" && {
      key: "stage",
      label: `${t("stage")}: ${stageLabel(filters.stage)}`,
      clear: { stage: "all" },
    },
    filters.attention && { key: "attention", label: t("attention"), clear: { attention: false } },
    filters.q && { key: "q", label: `“${filters.q}”`, clear: { q: "" } },
  ].filter(Boolean) as { key: string; label: string; clear: Partial<SupplierFilters> }[];
  const applied = chips.filter((c) => c.key !== "q").length;

  return (
    <div className="grid gap-3" aria-busy={pending}>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <ListFilter aria-hidden />
              {t("filters")}
              {applied ? (
                <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                  {applied}
                </span>
              ) : null}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <MenuRadio
                label={t("type")}
                value={filters.type}
                options={TYPE_FILTERS.map((v) => ({ value: v, label: typeLabel(v) }))}
                onChange={(v) => go({ type: v as SupplierFilters["type"] })}
              />
              <DropdownMenuSeparator />
              <MenuRadio
                label={t("approval")}
                value={filters.approval}
                options={APPROVAL_FILTERS.map((v) => ({ value: v, label: approvalLabel(v) }))}
                onChange={(v) => go({ approval: v as SupplierFilters["approval"] })}
              />
              <DropdownMenuSeparator />
              <MenuRadio
                label={t("stage")}
                value={filters.stage}
                options={STAGE_FILTERS.map((v) => ({ value: v, label: stageLabel(v) }))}
                onChange={(v) => go({ stage: v as SupplierFilters["stage"] })}
              />
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                closeOnClick
                checked={filters.attention}
                onCheckedChange={(on) => go({ attention: on })}
              >
                {t("attention")}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Phones have no column headers to click. */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="md:hidden" />}>
              <ArrowDownUp aria-hidden />
              {t("sortBy")}
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <MenuRadio
                label={t("sortBy")}
                value={filters.sort}
                options={SORT_KEYS.map((k) => ({ value: k, label: t(`col.${k}`) }))}
                onChange={(v) => go({ sort: v as SortKey })}
              />
              <DropdownMenuSeparator />
              <MenuRadio
                label={t("sortDir")}
                value={filters.dir}
                options={[
                  { value: "asc", label: t("asc") },
                  { value: "desc", label: t("desc") },
                ]}
                onChange={(v) => go({ dir: v as SortDir })}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={hrefFor(chip.clear)}
              scroll={false}
              aria-label={t("removeFilter", { name: chip.label })}
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary/10 px-2.5 text-sm font-medium text-primary hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              onClick={() => chip.key === "q" && setQ("")}
            >
              {chip.label}
              <X aria-hidden className="size-3.5" />
            </Link>
          ))}
          {chips.length > 1 ? (
            <Link
              href={`${action}${filtersQuery({ ...filters, q: "", type: "all", approval: "all", stage: "all", attention: false, page: 1 })}`}
              scroll={false}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              onClick={() => setQ("")}
            >
              {t("clear")}
            </Link>
          ) : null}
        </div>

        {/* A plain GET form, so Enter searches even before the page's JavaScript loads. */}
        <form
          action={action}
          role="search"
          className="sm:ml-auto sm:w-72"
          onSubmit={(e) => {
            e.preventDefault();
            clearTimeout(timer.current);
            go({ q: q.trim() });
          }}
        >
          <label htmlFor="f-q" className="sr-only">
            {t("search")}
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="f-q"
              ref={input}
              name="q"
              type="search"
              value={q}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className={cn("pl-8", pending && "opacity-80")}
            />
          </div>
          <HiddenFilters filters={filters} />
        </form>
      </div>
    </div>
  );
}

function MenuRadio({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(String(v))}>
        {options.map((o) => (
          <DropdownMenuRadioItem key={o.value} value={o.value} closeOnClick>
            {o.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

/** Keeps the other filters and the sort when the search form is submitted without JavaScript. */
function HiddenFilters({ filters }: { filters: SupplierFilters }) {
  return (
    <>
      {filters.type !== "all" ? <input type="hidden" name="tipo" value={filters.type} /> : null}
      {filters.approval !== "all" ? <input type="hidden" name="aprobacion" value={filters.approval} /> : null}
      {filters.stage !== "all" ? <input type="hidden" name="estado" value={filters.stage} /> : null}
      {filters.attention ? <input type="hidden" name="pendientes" value="1" /> : null}
      <input type="hidden" name="orden" value={sortParam(filters.sort)} />
      <input type="hidden" name="dir" value={filters.dir} />
    </>
  );
}
