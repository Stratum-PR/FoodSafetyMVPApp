"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, startTransition, useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalAction, ApprovalField } from "@/domain/approval";
import { cn } from "@/lib/utils";
import type { StatusFormState } from "@/server/supplier-actions";

/**
 * The decision: only the ones available now, each with a one-line explanation, then the fields
 * that decision needs. The page re-renders after saving, showing the new status and history.
 */
export function ApprovalForm({
  action,
  actions,
  minReviewBy,
  maxReviewBy,
}: {
  action: (previous: StatusFormState, form: FormData) => Promise<StatusFormState>;
  actions: ApprovalAction[];
  minReviewBy: string;
  maxReviewBy: string;
}) {
  const t = useTranslations("approval");
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [chosen, setChosen] = useState<ApprovalAction | "">("");

  const errors = state.status === "invalid" ? state.errors : {};
  const reasonRequired = chosen === "suspend" || chosen === "deactivate";

  // Submitting by hand keeps what was typed when the server sends errors back.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const describedBy = (field: ApprovalField, hint = false) =>
    [hint ? `ap-${field}-hint` : "", errors[field] ? `ap-${field}-error` : ""].join(" ").trim() || undefined;
  const message = (field: ApprovalField) =>
    errors[field] ? (
      <p id={`ap-${field}-error`} className="text-sm font-medium text-destructive">
        {t(`errors.${errors[field]!}`)}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-4" aria-busy={pending} noValidate>
      {state.status === "denied" ? (
        <p role="alert" className="rounded-lg bg-status-missing-bg px-3 py-2 text-sm font-medium text-status-missing">
          {t(`denial.${state.denial}`)}
        </p>
      ) : null}

      <fieldset className="grid gap-2" aria-describedby={describedBy("action")}>
        <legend className="mb-1 text-sm font-medium">{t("decision")}</legend>
        {actions.map((a) => (
          <label
            key={a}
            className={cn(
              "grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50",
              chosen === a && "border-primary bg-secondary/40",
            )}
          >
            <input
              type="radio"
              name="action"
              value={a}
              checked={chosen === a}
              onChange={() => setChosen(a)}
              className="row-span-2 mt-0.5 size-4 accent-primary"
            />
            <span className="font-semibold">{t(`actions.${a}`)}</span>
            <span className="text-muted-foreground">{t(`actionHints.${a}`)}</span>
          </label>
        ))}
        {message("action")}
      </fieldset>

      {chosen === "approve_conditional" ? (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="ap-conditions">{t("conditionsLabel")}</Label>
            <Textarea
              id="ap-conditions"
              name="conditions"
              rows={3}
              maxLength={1000}
              aria-invalid={Boolean(errors.conditions) || undefined}
              aria-describedby={describedBy("conditions", true)}
            />
            <p id="ap-conditions-hint" className="text-xs text-muted-foreground">
              {t("conditionsHint")}
            </p>
            {message("conditions")}
          </div>
          <div className="grid max-w-xs gap-1.5">
            <Label htmlFor="ap-reviewBy">{t("reviewByLabel")}</Label>
            <Input
              id="ap-reviewBy"
              name="reviewBy"
              type="date"
              min={minReviewBy}
              max={maxReviewBy}
              aria-invalid={Boolean(errors.reviewBy) || undefined}
              aria-describedby={describedBy("reviewBy", true)}
            />
            <p id="ap-reviewBy-hint" className="text-xs text-muted-foreground">
              {t("reviewByHint")}
            </p>
            {message("reviewBy")}
          </div>
        </>
      ) : null}

      {chosen ? (
        <div className="grid gap-1.5">
          <Label htmlFor="ap-reason">{reasonRequired ? t("reasonRequired") : t("reason")}</Label>
          <Textarea
            id="ap-reason"
            name="reason"
            rows={2}
            maxLength={1000}
            aria-invalid={Boolean(errors.reason) || undefined}
            aria-describedby={describedBy("reason", true)}
          />
          <p id="ap-reason-hint" className="text-xs text-muted-foreground">
            {t("reasonHint")}
          </p>
          {message("reason")}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!chosen || pending}>
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
