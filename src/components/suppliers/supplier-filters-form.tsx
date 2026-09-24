"use client";

import { Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APPROVAL_FILTERS, type SupplierFilters, TYPE_FILTERS } from "@/server/supplier-filters";

const SELECT =
  "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Search and filters. A plain GET form: works without JavaScript, and with it, dropdowns apply at once. */
export function SupplierFiltersForm({
  action,
  filters,
  filtered,
}: {
  action: string;
  filters: SupplierFilters;
  filtered: boolean;
}) {
  const t = useTranslations("suppliers");
  const tType = useTranslations("partyType");
  const tApproval = useTranslations("approval");
  const submit = (e: ChangeEvent<HTMLSelectElement | HTMLInputElement>) => e.currentTarget.form?.requestSubmit();

  return (
    <Form
      action={action}
      className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="f-q">{t("search")}</Label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="f-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder={t("searchPlaceholder")}
            className="pl-8"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-type">{t("type")}</Label>
        <select id="f-type" name="tipo" defaultValue={filters.type} onChange={submit} className={SELECT}>
          {TYPE_FILTERS.map((v) => (
            <option key={v} value={v}>
              {v === "all" ? t("allTypes") : tType(v)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-approval">{t("approval")}</Label>
        <select id="f-approval" name="aprobacion" defaultValue={filters.approval} onChange={submit} className={SELECT}>
          {APPROVAL_FILTERS.map((v) => (
            <option key={v} value={v}>
              {v === "all" ? t("allApprovals") : tApproval(v)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="pendientes"
            value="1"
            defaultChecked={filters.attention}
            onChange={submit}
            className="size-4 accent-primary"
          />
          {t("attention")}
        </label>
        <div className="ml-auto flex gap-2">
          {filtered ? (
            <Link href={action} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("clear")}
            </Link>
          ) : null}
          <Button type="submit" size="sm">
            {t("apply")}
          </Button>
        </div>
      </div>
    </Form>
  );
}
