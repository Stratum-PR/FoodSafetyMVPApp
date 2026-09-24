"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DESCRIPTION_MAX, LOT_MAX, type NonconformityField, SEVERITIES } from "@/domain/nonconformity";
import type { NonconformityFormState } from "@/server/supplier-actions";

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

/** Records a supplier nonconformity. Opens from a "Registrar no conformidad" disclosure. */
export function NonconformityForm({
  action,
  today,
}: {
  action: (previous: NonconformityFormState, form: FormData) => Promise<NonconformityFormState>;
  today: string;
}) {
  const t = useTranslations("nonconformities");
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const errors = state.status === "invalid" ? state.errors : {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    startTransition(async () => {
      formAction(new FormData(form));
    });
  }

  const describedBy = (field: NonconformityField, hint = false) =>
    [hint ? `nc-${field}-hint` : "", errors[field] ? `nc-${field}-error` : ""].join(" ").trim() || undefined;
  const message = (field: NonconformityField) =>
    errors[field] ? (
      <p id={`nc-${field}-error`} className="text-sm font-medium text-destructive">
        {t(`errors.${errors[field]!}`)}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-4" aria-busy={pending} noValidate>
      {state.status === "denied" ? (
        <p role="alert" className="rounded-lg bg-status-missing-bg px-3 py-2 text-sm font-medium text-status-missing">
          {t(`errors.${state.denial}`)}
        </p>
      ) : null}
      {state.status === "done" ? (
        <p role="status" className="rounded-lg bg-status-current-bg px-3 py-2 text-sm font-medium text-status-current">
          {t("done")}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="nc-date">{t("date")}</Label>
          <Input
            id="nc-date"
            name="date"
            type="date"
            defaultValue={today}
            max={today}
            aria-invalid={Boolean(errors.date) || undefined}
            aria-describedby={describedBy("date")}
          />
          {message("date")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nc-severity">{t("severityLabel")}</Label>
          <select
            id="nc-severity"
            name="severity"
            defaultValue=""
            className={SELECT}
            aria-invalid={Boolean(errors.severity) || undefined}
            aria-describedby={describedBy("severity")}
          >
            <option value="">{t("severityPlaceholder")}</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`severity.${s}`)}
              </option>
            ))}
          </select>
          {message("severity")}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="nc-description">{t("description")}</Label>
        <Textarea
          id="nc-description"
          name="description"
          rows={3}
          maxLength={DESCRIPTION_MAX}
          aria-invalid={Boolean(errors.description) || undefined}
          aria-describedby={describedBy("description", true)}
        />
        <p id="nc-description-hint" className="text-xs text-muted-foreground">
          {t("descriptionHint")}
        </p>
        {message("description")}
      </div>
      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="nc-lotCode">{t("lot")}</Label>
        <Input
          id="nc-lotCode"
          name="lotCode"
          maxLength={LOT_MAX}
          aria-invalid={Boolean(errors.lotCode) || undefined}
          aria-describedby={describedBy("lotCode")}
        />
        {message("lotCode")}
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="outline" disabled={pending}>
          {t("submit")}
        </Button>
        {pending ? (
          <span role="status" className="text-sm text-muted-foreground">
            {t("saving")}
          </span>
        ) : null}
      </div>
    </form>
  );
}
