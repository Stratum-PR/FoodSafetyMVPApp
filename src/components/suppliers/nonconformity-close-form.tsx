"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, startTransition, useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CloseFormState } from "@/server/supplier-actions";

/** Close an open nonconformity with a short note of what was done. The record stays. */
export function NonconformityCloseForm({
  action,
}: {
  action: (previous: CloseFormState, form: FormData) => Promise<CloseFormState>;
}) {
  const t = useTranslations("nonconformities");
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        {t("close")}
      </Button>
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const error =
    state.status === "invalid"
      ? t(`closeErrors.${state.error}`)
      : state.status === "denied"
        ? t(`errors.${state.denial}`)
        : null;

  return (
    <form onSubmit={onSubmit} className="grid min-w-56 gap-1.5" aria-busy={pending} noValidate>
      <Label htmlFor={`${id}-note`}>{t("closeNote")}</Label>
      <Textarea
        id={`${id}-note`}
        name="note"
        rows={2}
        maxLength={1000}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" className="w-fit" disabled={pending}>
        {t("closeSubmit")}
      </Button>
    </form>
  );
}
