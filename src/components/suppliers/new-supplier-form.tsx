"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, startTransition, useActionState, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CITY_MAX, COMMON_COUNTRIES, NAME_MAX, type NewSupplierField, PARTY_TYPES } from "@/domain/new-supplier";
import type { NewSupplierFormState } from "@/server/supplier-actions";

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

const OTHER = "other";

/** Adds a supplier: who it is and where. Documents, materials and approval come after, on its page. */
export function NewSupplierForm({
  action,
  cancelHref,
}: {
  action: (previous: NewSupplierFormState, form: FormData) => Promise<NewSupplierFormState>;
  cancelHref: string;
}) {
  const t = useTranslations("newSupplier");
  const tType = useTranslations("partyType");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [country, setCountry] = useState("PR");
  const errors = state.status === "invalid" ? state.errors : {};

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return COMMON_COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code }));
  }, [locale]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("country") === OTHER) form.set("country", String(form.get("countryOther") ?? ""));
    startTransition(async () => {
      formAction(form);
    });
  }

  const describedBy = (field: NewSupplierField, hint = false) =>
    [hint ? `ns-${field}-hint` : "", errors[field] ? `ns-${field}-error` : ""].join(" ").trim() || undefined;
  const message = (field: NewSupplierField) =>
    errors[field] ? (
      <p id={`ns-${field}-error`} className="text-sm font-medium text-destructive">
        {t(`errors.${errors[field]!}`)}
      </p>
    ) : null;
  const invalid = (field: NewSupplierField) => Boolean(errors[field]) || undefined;

  return (
    <form
      onSubmit={onSubmit}
      className="grid max-w-2xl gap-5 rounded-xl border bg-card p-4 sm:p-6"
      aria-busy={pending}
      noValidate
    >
      {state.status === "denied" ? (
        <p role="alert" className="rounded-lg bg-status-missing-bg px-3 py-2 text-sm font-medium text-status-missing">
          {t("errors.denied")}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="ns-name">{t("name")}</Label>
        <Input
          id="ns-name"
          name="name"
          maxLength={NAME_MAX}
          autoComplete="organization"
          aria-invalid={invalid("name")}
          aria-describedby={describedBy("name")}
          required
        />
        {message("name")}
      </div>

      <fieldset className="grid gap-2" aria-describedby={describedBy("type", true)}>
        <legend className="mb-1 text-sm font-medium">{t("type")}</legend>
        <p id="ns-type-hint" className="text-sm text-muted-foreground">
          {t("typeHint")}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {PARTY_TYPES.map((type) => (
            <label
              key={type}
              className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
            >
              <input type="radio" name="type" value={type} className="size-4 accent-primary" />
              {tType(type)}
            </label>
          ))}
        </div>
        {message("type")}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="ns-city">{t("city")}</Label>
          <Input
            id="ns-city"
            name="city"
            maxLength={CITY_MAX}
            autoComplete="address-level2"
            aria-invalid={invalid("city")}
            aria-describedby={describedBy("city")}
            required
          />
          {message("city")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ns-country">{t("country")}</Label>
          <select
            id="ns-country"
            name="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={SELECT}
            aria-invalid={invalid("country")}
            aria-describedby={describedBy("country")}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
            <option value={OTHER}>{t("countryOther")}</option>
          </select>
          {country === OTHER ? (
            <div className="grid gap-1.5">
              <Label htmlFor="ns-country-other">{t("countryCode")}</Label>
              <Input
                id="ns-country-other"
                name="countryOther"
                maxLength={2}
                className="w-24 uppercase"
                aria-invalid={invalid("country")}
                aria-describedby={describedBy("country")}
              />
            </div>
          ) : null}
          {message("country")}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ns-fei">{t("fei")}</Label>
        <Input
          id="ns-fei"
          name="fei"
          inputMode="numeric"
          maxLength={14}
          className="sm:w-60"
          aria-invalid={invalid("fei")}
          aria-describedby={describedBy("fei", true)}
        />
        <p id="ns-fei-hint" className="text-sm text-muted-foreground">
          {t("feiHint")}
        </p>
        {message("fei")}
      </div>

      <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{t("next")}</p>

      <div className="flex flex-wrap justify-end gap-2">
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
          {t("cancel")}
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
