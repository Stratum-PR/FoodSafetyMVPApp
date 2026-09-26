"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, startTransition, useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APPROVAL_BASES, type ApprovalAction, type ApprovalField } from "@/domain/approval";
import { RESTRICTIONS } from "@/domain/suppliers";
import { cn } from "@/lib/utils";
import type { StatusFormState } from "@/server/supplier-actions";

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

/**
 * The decision: only the ones available now, each with a one-line explanation, then the fields
 * that decision needs. Approving asks what it rests on and when it's reviewed again; a
 * conditional approval also asks its conditions, who follows them, from when, for which
 * materials and with which receiving restrictions. The server checks everything again.
 */
export function ApprovalForm({
  action,
  actions,
  blockingOpen,
  today,
  defaultReviewBy,
  minReviewBy,
  maxReviewBy,
  maxConditionalReviewBy,
  owners,
  sources,
}: {
  action: (previous: StatusFormState, form: FormData) => Promise<StatusFormState>;
  actions: ApprovalAction[];
  /** Unmet blocking requirements: a full approval waits for them. */
  blockingOpen: number;
  today: string;
  defaultReviewBy: string;
  minReviewBy: string;
  maxReviewBy: string;
  maxConditionalReviewBy: string;
  owners: { id: string; name: string }[];
  sources: { id: string; label: string; active: boolean }[];
}) {
  const t = useTranslations("approval");
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [chosen, setChosen] = useState<ApprovalAction | "">("");

  const errors = state.status === "invalid" ? state.errors : {};
  const approving = chosen === "approve" || chosen === "approve_conditional";
  const conditional = chosen === "approve_conditional";
  const reasonRequired = conditional || chosen === "suspend" || chosen === "reject" || chosen === "deactivate";

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
  const invalid = (field: ApprovalField) => Boolean(errors[field]) || undefined;

  // A plain function, not a component: a component defined here would remount on every render
  // and lose the boxes already ticked.
  function checks({
    field,
    legend,
    hint,
    options,
  }: {
    field: ApprovalField;
    legend: string;
    hint?: string;
    options: { value: string; label: ReactNode }[];
  }) {
    return (
      <fieldset className="grid gap-2" aria-describedby={describedBy(field, Boolean(hint))}>
        <legend className="mb-1 text-sm font-medium">{legend}</legend>
        {hint ? (
          <p id={`ap-${field}-hint`} className="-mt-1 text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        <div className="grid gap-1.5 sm:grid-cols-2">
          {options.map((o) => (
            <label key={o.value} className="inline-flex items-start gap-2 text-sm">
              <input type="checkbox" name={field} value={o.value} className="mt-0.5 size-4 shrink-0 accent-primary" />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        {message(field)}
      </fieldset>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" aria-busy={pending} noValidate>
      {state.status === "denied" ? (
        <p role="alert" className="rounded-lg bg-status-missing-bg px-3 py-2 text-sm font-medium text-status-missing">
          {t(`denial.${state.denial}`)}
        </p>
      ) : null}

      <fieldset className="grid gap-2" aria-describedby={describedBy("action")}>
        <legend className="mb-1 text-sm font-medium">{t("decision")}</legend>
        {actions.map((a) => {
          const blocked = a === "approve" && blockingOpen > 0;
          return (
            <label
              key={a}
              className={cn(
                "grid grid-cols-[auto_1fr] gap-x-3 rounded-lg border p-3 text-sm transition-colors",
                blocked ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-muted/50",
                chosen === a && "border-primary bg-secondary/40",
              )}
            >
              <input
                type="radio"
                name="action"
                value={a}
                checked={chosen === a}
                disabled={blocked}
                onChange={() => setChosen(a)}
                className="row-span-2 mt-0.5 size-4 accent-primary"
              />
              <span className="font-semibold">{t(`actions.${a}`)}</span>
              <span className="text-muted-foreground">
                {blocked ? t("blockedHint", { count: blockingOpen }) : t(`actionHints.${a}`)}
              </span>
            </label>
          );
        })}
        {message("action")}
      </fieldset>

      {approving ? (
        <>
          {checks({
            field: "basis",
            legend: t("basisLabel"),
            hint: t("basisHint"),
            options: APPROVAL_BASES.map((b) => ({ value: b, label: t(`basis.${b}`) })),
          })}
          <div className="grid max-w-xs gap-1.5">
            <Label htmlFor="ap-reviewBy">{t("reviewByLabel")}</Label>
            <Input
              // Remount when switching between a full and a conditional approval: their limits differ.
              key={chosen}
              id="ap-reviewBy"
              name="reviewBy"
              type="date"
              min={minReviewBy}
              max={conditional ? maxConditionalReviewBy : maxReviewBy}
              defaultValue={conditional ? "" : defaultReviewBy}
              aria-invalid={invalid("reviewBy")}
              aria-describedby={describedBy("reviewBy", true)}
            />
            <p id="ap-reviewBy-hint" className="text-xs text-muted-foreground">
              {conditional ? t("reviewByHintConditional") : t("reviewByHint")}
            </p>
            {message("reviewBy")}
          </div>
        </>
      ) : null}

      {conditional ? (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="ap-conditions">{t("conditionsLabel")}</Label>
            <Textarea
              id="ap-conditions"
              name="conditions"
              rows={3}
              maxLength={1000}
              aria-invalid={invalid("conditions")}
              aria-describedby={describedBy("conditions", true)}
            />
            <p id="ap-conditions-hint" className="text-xs text-muted-foreground">
              {t("conditionsHint")}
            </p>
            {message("conditions")}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ap-owner">{t("ownerLabel")}</Label>
              <select
                id="ap-owner"
                name="owner"
                defaultValue=""
                className={SELECT}
                aria-invalid={invalid("owner")}
                aria-describedby={describedBy("owner")}
              >
                <option value="">{t("ownerPlaceholder")}</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {message("owner")}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ap-effectiveOn">{t("effectiveOnLabel")}</Label>
              <Input
                id="ap-effectiveOn"
                name="effectiveOn"
                type="date"
                defaultValue={today}
                aria-invalid={invalid("effectiveOn")}
                aria-describedby={describedBy("effectiveOn")}
              />
              {message("effectiveOn")}
            </div>
          </div>
          {sources.length
            ? checks({
                field: "allowedSourceIds",
                legend: t("scopeLabel"),
                hint: t("scopeHint"),
                options: sources.map((s) => ({
                  value: s.id,
                  label: s.active ? s.label : `${s.label} · ${t("notBought")}`,
                })),
              })
            : null}
          {checks({
            field: "restrictions",
            legend: t("restrictionsLabel"),
            options: RESTRICTIONS.map((r) => ({ value: r, label: t(`restrictions.${r}`) })),
          })}
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
            aria-invalid={invalid("reason")}
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
