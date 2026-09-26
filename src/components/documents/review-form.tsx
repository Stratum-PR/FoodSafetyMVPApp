"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GFSI_SCHEMES, OTHER_SCHEME, TEXT_MAX, type VerificationField } from "@/domain/evidence";
import { REASON_MAX } from "@/domain/review";
import { CHECKLIST_ITEMS } from "@/domain/suppliers";
import type { ReviewFormState } from "@/server/document-actions";

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

/**
 * Aceptar / Rechazar with the review checklist and, for certificates and insurance, the details
 * read off the document. The server checks everything again. On success the page re-renders
 * showing the decision, so this form only shows errors.
 */
export function ReviewForm({
  action,
  detailsKind,
  canAccept,
  minimum,
}: {
  action: (previous: ReviewFormState, form: FormData) => Promise<ReviewFormState>;
  detailsKind: "certificate" | "insurance" | null;
  /** False when the document has no file: it can only be rejected. */
  canAccept: boolean;
  /** The company's insurance minimum, already formatted (insurance only). */
  minimum: string | null;
}) {
  const t = useTranslations("document");
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const error = state.status === "error" ? state.code : null;
  const errors = state.status === "error" ? (state.errors ?? {}) : {};
  const reasonError = error === "reason_required" || error === "reason_too_long";

  // Submitting by hand keeps what was typed when the server sends errors back.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const form = new FormData(event.currentTarget);
    if (submitter?.name) form.set(submitter.name, submitter.value);
    startTransition(() => formAction(form));
  }

  const fieldError = (name: VerificationField) =>
    errors[name] ? (
      <p id={`rv-${name}-error`} className="text-sm font-medium text-destructive">
        {t(`verr.${errors[name]}`)}
      </p>
    ) : null;
  const text = (name: VerificationField, label: string, props: Record<string, unknown> = {}, hint?: ReactNode) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`rv-${name}`}>{label}</Label>
      <Input
        id={`rv-${name}`}
        name={name}
        maxLength={TEXT_MAX}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `rv-${name}-error` : undefined}
        {...props}
      />
      {hint}
      {fieldError(name)}
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-5" aria-busy={pending} noValidate>
      {canAccept ? (
        <>
          <p className="text-sm text-muted-foreground">{t("review.acceptHint")}</p>
          <fieldset
            className="grid gap-2"
            aria-describedby={errors.checklist ? "rv-checklist-error" : "rv-checklist-hint"}
          >
            <legend className="mb-1 text-sm font-semibold">{t("review.checklistTitle")}</legend>
            <p id="rv-checklist-hint" className="text-xs text-muted-foreground">
              {t("review.checklistHint")}
            </p>
            {CHECKLIST_ITEMS.map((item) => (
              <label key={item} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="checklist" value={item} className="mt-0.5 size-4 accent-primary" />
                {t(`review.checklist.${item}`)}
              </label>
            ))}
            {fieldError("checklist")}
          </fieldset>

          {detailsKind === "certificate" ? (
            <fieldset className="grid gap-3 border-t pt-4">
              <legend className="text-sm font-semibold">{t("review.certificateTitle")}</legend>
              <p className="text-xs text-muted-foreground">{t("review.detailsHint")}</p>
              <div className="grid gap-1.5">
                <Label htmlFor="rv-scheme">{t("field.scheme")}</Label>
                <select
                  id="rv-scheme"
                  name="scheme"
                  defaultValue=""
                  className={SELECT}
                  aria-invalid={errors.scheme ? true : undefined}
                  aria-describedby={errors.scheme ? "rv-scheme-error" : undefined}
                >
                  <option value="">{t("field.choose")}</option>
                  {GFSI_SCHEMES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                  <option value={OTHER_SCHEME}>{t("field.other")}</option>
                </select>
                {fieldError("scheme")}
              </div>
              {text("scope", t("field.scope"))}
              {text("issuingBody", t("field.issuingBody"))}
              {text("certificateNumber", t("field.certificateNumber"))}
              {text("facility", t("field.facility"))}
              {text("auditDate", t("field.auditDate"), { type: "date" })}
              <div className="grid gap-1">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="directoryVerified"
                    className="mt-0.5 size-4 accent-primary"
                    aria-describedby="rv-directoryVerified-hint"
                  />
                  {t("field.directoryVerified")}
                </label>
                <p id="rv-directoryVerified-hint" className="text-xs text-muted-foreground">
                  {t("field.directoryHint")}
                </p>
                {fieldError("directoryVerified")}
              </div>
            </fieldset>
          ) : null}

          {detailsKind === "insurance" ? (
            <fieldset className="grid gap-3 border-t pt-4">
              <legend className="text-sm font-semibold">{t("review.insuranceTitle")}</legend>
              <p className="text-xs text-muted-foreground">{t("review.detailsHint")}</p>
              {text("insurer", t("field.insurer"))}
              {text("policyNumber", t("field.policyNumber"))}
              {text(
                "coverageUsd",
                t("field.coverageUsd"),
                { inputMode: "numeric" },
                minimum ? (
                  <p className="text-xs text-muted-foreground">{t("field.coverageHint", { minimum })}</p>
                ) : null,
              )}
            </fieldset>
          ) : null}
        </>
      ) : null}

      <div className="grid gap-1.5 border-t pt-4">
        <Label htmlFor="review-reason">{t("review.reason")}</Label>
        <Textarea
          id="review-reason"
          name="reason"
          maxLength={REASON_MAX}
          rows={3}
          aria-invalid={reasonError || undefined}
          aria-describedby="review-reason-hint"
        />
        <p id="review-reason-hint" className="text-xs text-muted-foreground">
          {t("review.reasonHint")}
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-status-missing-bg px-3 py-2 text-sm font-medium text-status-missing">
          {t(`denial.${error}`)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canAccept ? (
          <Button type="submit" name="decision" value="accept" disabled={pending}>
            <Check aria-hidden />
            {t("review.accept")}
          </Button>
        ) : null}
        <Button type="submit" name="decision" value="reject" variant="outline" disabled={pending}>
          <X aria-hidden />
          {t("review.reject")}
        </Button>
        {pending ? (
          <span role="status" className="self-center text-sm text-muted-foreground">
            {t("review.saving")}
          </span>
        ) : null}
      </div>
    </form>
  );
}
