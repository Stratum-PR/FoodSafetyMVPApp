"use client";

import { Check, Copy, Link2, MessageCircle, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RequestActionState } from "@/server/request-actions";

/**
 * The supplier link panel. A link's secret is shown only right after it's made (sending, or
 * "new link"): it arrives in the page's #fragment after sending (never sent to the server or
 * logged) and is removed from the address bar at once.
 */
export function LinkPanel({
  company,
  state,
  send,
  newLink,
  canSend,
  canNewLink,
}: {
  company: string;
  state: "draft" | "sent" | "cancelled";
  send: () => Promise<RequestActionState>;
  newLink: () => Promise<RequestActionState>;
  canSend: boolean;
  canNewLink: boolean;
}) {
  const t = useTranslations("requests.detail");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const match = /^#enlace=(.+)$/.exec(window.location.hash);
    if (match) {
      // Reading the fragment once, after mount, is the point here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLink(decodeURIComponent(match[1]));
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const run = (fn: () => Promise<RequestActionState>) =>
    start(async () => {
      const result = await fn();
      setFailed(result.status === "error");
      if (result.status === "done" && result.link) {
        setLink(result.link);
        setCopied(false);
      }
    });

  const whatsapp = link ? `https://wa.me/?text=${encodeURIComponent(t("link.whatsappText", { company, link }))}` : null;

  return (
    <div className="grid gap-3">
      {link ? (
        <div className="grid gap-2 rounded-lg border border-primary/40 bg-secondary p-3">
          <p className="text-sm font-medium">{t("link.once")}</p>
          <p className="rounded bg-background px-2 py-1 font-mono text-xs break-all" data-testid="request-link">
            {link}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? t("link.copied") : t("link.copy")}
            </Button>
            <a
              href={whatsapp!}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <MessageCircle aria-hidden />
              {t("link.whatsapp")}
            </a>
          </div>
          <span role="status" className="sr-only">
            {copied ? t("link.copied") : ""}
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canSend ? (
          <Button type="button" onClick={() => run(send)} disabled={pending}>
            <Send aria-hidden />
            {state === "draft" ? t("send") : t("resend")}
          </Button>
        ) : null}
        {canNewLink ? (
          <Button type="button" variant="outline" onClick={() => run(newLink)} disabled={pending}>
            <Link2 aria-hidden />
            {t("link.new")}
          </Button>
        ) : null}
      </div>
      {canNewLink ? <p className="text-xs text-muted-foreground">{t("link.newHint")}</p> : null}
      {failed ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t("reasonErrors.closed")}
        </p>
      ) : null}
    </div>
  );
}

/** A reason and a button: cancelling the request, or closing one item without a document. */
export function ReasonForm({
  action,
  id,
  label,
  hint,
  submit,
  destructive,
}: {
  action: (previous: RequestActionState, form: FormData) => Promise<RequestActionState>;
  id: string;
  label: string;
  hint?: string;
  submit: string;
  destructive?: boolean;
}) {
  const t = useTranslations("requests.detail");
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const error = state.status === "invalid" ? state.error : null;
  return (
    <form action={formAction} className="grid gap-2" aria-busy={pending}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name="reason"
        rows={2}
        maxLength={500}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined
        }
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-destructive">
          {t(`reasonErrors.${error}`)}
        </p>
      ) : null}
      <Button
        type="submit"
        size="sm"
        variant={destructive ? "destructive" : "outline"}
        disabled={pending}
        className="w-fit"
      >
        <X aria-hidden />
        {submit}
      </Button>
    </form>
  );
}
