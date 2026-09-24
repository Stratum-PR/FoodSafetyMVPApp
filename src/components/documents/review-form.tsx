"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REASON_MAX } from "@/domain/review";
import type { ReviewFormState } from "@/server/document-actions";

/**
 * Aceptar / Rechazar. The action is bound to the company and document on the server.
 * On success the page re-renders showing the decision, so this form only shows errors.
 */
export function ReviewForm({
  action,
}: {
  action: (previous: ReviewFormState, form: FormData) => Promise<ReviewFormState>;
}) {
  const t = useTranslations("document");
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const error = state.status === "error" ? state.code : null;
  const reasonError = error === "reason_required" || error === "reason_too_long";

  return (
    <form action={formAction} className="grid gap-4" aria-busy={pending}>
      <p className="text-sm text-muted-foreground">{t("review.acceptHint")}</p>
      <div className="grid gap-1.5">
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
        <Button type="submit" name="decision" value="accept" disabled={pending}>
          <Check aria-hidden />
          {t("review.accept")}
        </Button>
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
