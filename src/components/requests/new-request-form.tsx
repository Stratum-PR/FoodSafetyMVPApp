"use client";

import { Save, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, startTransition, useActionState } from "react";

import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MESSAGE_MAX } from "@/domain/requests";
import type { NewRequestState } from "@/server/request-actions";
import type { RequestTarget } from "@/server/requests";

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

/**
 * The request itself, for one supplier: contact, which gaps to ask for, due date, language and
 * an optional note. Items already in another open request can't be picked. The server checks
 * everything again.
 */
export function NewRequestForm({
  action,
  target,
  checked,
  dueOn,
  minDue,
  maxDue,
  labels,
}: {
  action: (previous: NewRequestState, form: FormData) => Promise<NewRequestState>;
  target: RequestTarget;
  /** Gap keys pre-checked (from the link that opened the form). */
  checked: string[];
  dueOn: string;
  minDue: string;
  maxDue: string;
  /** Display text for each gap, made on the server (requirement, program, what it applies to). */
  labels: Record<string, { title: string; detail: string }>;
}) {
  const t = useTranslations("requests.form");
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const errors = state.status === "invalid" ? state.errors : {};
  const primary = target.contacts.find((c) => c.isPrimary) ?? target.contacts[0];

  // Submitting by hand keeps what was typed when the server sends errors back.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const form = new FormData(event.currentTarget);
    if (submitter?.name) form.set(submitter.name, submitter.value);
    startTransition(() => formAction(form));
  }
  const error = (field: keyof typeof errors) =>
    errors[field] ? (
      <p id={`nr-${field}-error`} className="text-sm font-medium text-destructive">
        {t(`errors.${errors[field]!}`)}
      </p>
    ) : null;

  if (!target.contacts.length) {
    return <p className="rounded-lg bg-secondary px-3 py-2 text-sm">{t("noContact")}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-5" aria-busy={pending} noValidate>
      <input type="hidden" name="partyId" value={target.partyId} />
      {Object.keys(errors).length ? (
        <p role="alert" className="rounded-lg bg-status-missing-bg px-3 py-2 text-sm font-medium text-status-missing">
          {t("summary")}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="rounded-lg bg-status-missing-bg px-3 py-2 text-sm font-medium text-status-missing">
          {t("errors.required")}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="nr-contactId">{t("contact")}</Label>
        <select
          id="nr-contactId"
          name="contactId"
          defaultValue={primary.id}
          className={SELECT}
          aria-invalid={errors.contactId ? true : undefined}
        >
          {target.contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.email}
              {c.isPrimary ? ` (${t("primary")})` : ""}
            </option>
          ))}
        </select>
        {error("contactId")}
      </div>

      <fieldset className="grid gap-2" aria-describedby="nr-items-hint">
        <legend className="text-sm font-semibold">{t("items")}</legend>
        <p id="nr-items-hint" className="text-xs text-muted-foreground">
          {t("itemsHint")}
        </p>
        <ul className="grid gap-2">
          {target.gaps.map((g, i) => (
            <li key={g.key} className="flex items-start gap-3 rounded-lg border bg-card p-3 text-sm">
              <input
                id={`nr-key-${i}`}
                type="checkbox"
                name="key"
                value={g.key}
                defaultChecked={!g.requested && (checked.length ? checked.includes(g.key) : true)}
                disabled={g.requested}
                aria-describedby={`nr-key-${i}-detail`}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="grid min-w-0 flex-1 gap-1">
                <label htmlFor={`nr-key-${i}`} className="font-medium">
                  {labels[g.key]?.title ?? g.key}
                </label>
                <span id={`nr-key-${i}-detail`} className="text-xs text-muted-foreground">
                  {labels[g.key]?.detail}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <StatusPill status={g.status} />
                  {g.requested ? <span className="text-xs font-semibold">{t("alreadyRequested")}</span> : null}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {error("requirementKeys")}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="nr-dueOn">{t("dueOn")}</Label>
          <Input
            id="nr-dueOn"
            name="dueOn"
            type="date"
            defaultValue={dueOn}
            min={minDue}
            max={maxDue}
            aria-invalid={errors.dueOn ? true : undefined}
            aria-describedby="nr-dueOn-hint"
          />
          <p id="nr-dueOn-hint" className="text-xs text-muted-foreground">
            {t("dueHint")}
          </p>
          {error("dueOn")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nr-language">{t("language")}</Label>
          <select id="nr-language" name="language" defaultValue={primary.language} className={SELECT}>
            <option value="es">{t("languageOption.es")}</option>
            <option value="en">{t("languageOption.en")}</option>
          </select>
          {error("language")}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="nr-message">{t("message")}</Label>
        <Textarea
          id="nr-message"
          name="message"
          rows={3}
          maxLength={MESSAGE_MAX}
          aria-describedby="nr-message-hint"
          aria-invalid={errors.message ? true : undefined}
        />
        <p id="nr-message-hint" className="text-xs text-muted-foreground">
          {t("messageHint")}
        </p>
        {error("message")}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="send" disabled={pending}>
          <Send aria-hidden />
          {t("send")}
        </Button>
        <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending}>
          <Save aria-hidden />
          {t("saveDraft")}
        </Button>
        {pending ? (
          <span role="status" className="self-center text-sm text-muted-foreground">
            {t("saving")}
          </span>
        ) : null}
      </div>
    </form>
  );
}
