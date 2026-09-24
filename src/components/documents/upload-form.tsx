"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type FormEvent, startTransition, useActionState, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DocumentType } from "@/domain/catalog";
import { LOT_MAX, MAX_FILE_BYTES, typeFitsSubject, type UploadError, type UploadField } from "@/domain/upload";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { UploadFormState } from "@/server/document-actions";
import type { UploadTarget } from "@/server/documents";

const SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

/**
 * New document: supplier → what it's for (the supplier itself or one of its materials) →
 * type (only the ones that fit) → lot, dates and file. The server checks everything again.
 */
export function UploadForm({
  action,
  suppliers,
  types,
  lang,
  initial,
  cancelHref,
}: {
  action: (previous: UploadFormState, form: FormData) => Promise<UploadFormState>;
  suppliers: UploadTarget[];
  types: DocumentType[];
  lang: Locale;
  initial: { partyId: string; about: string; typeCode: string };
  cancelHref: string;
}) {
  const t = useTranslations("upload");
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [partyId, setPartyId] = useState(initial.partyId);
  const [about, setAbout] = useState(initial.about);
  const [typeCode, setTypeCode] = useState(initial.typeCode);
  const [fileError, setFileError] = useState<UploadError | null>(null);

  const supplier = suppliers.find((s) => s.id === partyId);
  const material = supplier?.materials.find((m) => m.sourceId === about);
  const subject = !supplier
    ? null
    : about === "party"
      ? ({ kind: "party", partyId } as const)
      : material
        ? ({ kind: "source", sourceId: material.sourceId } as const)
        : null;
  const fitting = subject ? types.filter((type) => typeFitsSubject(type, subject, material?.kind ?? null)) : [];
  const type = fitting.find((x) => x.code === typeCode);

  const serverErrors = state.status === "invalid" ? state.errors : {};
  const errors: Partial<Record<UploadField, UploadError>> = {
    ...serverErrors,
    ...(fileError ? { file: fileError } : {}),
  };
  const errorFor = (field: UploadField) => errors[field];

  // Submitting by hand keeps what was typed when the server sends errors back (a plain form
  // action would reset the fields). Oversized files are stopped here before being sent.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (file instanceof File && file.size > MAX_FILE_BYTES) {
      setFileError("file_too_large");
      return;
    }
    setFileError(null);
    startTransition(() => formAction(form));
  }

  const field = (name: UploadField, label: string, control: React.ReactNode, hint?: string) => {
    const error = errorFor(name);
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={`u-${name}`}>{label}</Label>
        {control}
        {hint ? (
          <p id={`u-${name}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={`u-${name}-error`} className="text-sm font-medium text-destructive">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </div>
    );
  };
  const describedBy = (name: UploadField, hint: boolean) =>
    [hint ? `u-${name}-hint` : null, errorFor(name) ? `u-${name}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-5" aria-busy={pending} noValidate>
      {Object.keys(errors).length ? (
        <p role="alert" className="rounded-lg bg-status-missing-bg px-3 py-2 text-sm font-medium text-status-missing">
          {t("summary")}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="rounded-lg bg-status-missing-bg px-3 py-2 text-sm font-medium text-status-missing">
          {t(`errors.${state.code}`)}
        </p>
      ) : null}

      {field(
        "subject",
        t("supplier"),
        <select
          id="u-subject"
          name="partyId"
          value={partyId}
          onChange={(e) => {
            setPartyId(e.target.value);
            setAbout("party");
            setTypeCode("");
          }}
          aria-invalid={Boolean(errorFor("subject")) || undefined}
          aria-describedby={describedBy("subject", false)}
          className={SELECT}
          required
        >
          <option value="">{t("supplierPlaceholder")}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>,
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="u-about">{t("about")}</Label>
        <select
          id="u-about"
          name="about"
          value={about}
          onChange={(e) => {
            setAbout(e.target.value);
            setTypeCode("");
          }}
          disabled={!supplier}
          className={SELECT}
        >
          <option value="party">{t("aboutParty")}</option>
          {supplier?.materials.map((m) => (
            <option key={m.sourceId} value={m.sourceId}>
              {m.name} ({m.code}) · {m.role === "makes" ? t("makes") : t("sells")}
            </option>
          ))}
        </select>
      </div>

      {field(
        "typeCode",
        t("type"),
        <select
          id="u-typeCode"
          name="typeCode"
          value={type ? typeCode : ""}
          onChange={(e) => setTypeCode(e.target.value)}
          disabled={!subject}
          aria-invalid={Boolean(errorFor("typeCode")) || undefined}
          aria-describedby={describedBy("typeCode", false)}
          className={SELECT}
          required
        >
          <option value="">{t("typePlaceholder")}</option>
          {fitting.map((x) => (
            <option key={x.code} value={x.code}>
              {x.name[lang]}
            </option>
          ))}
        </select>,
      )}

      {type?.perLot
        ? field(
            "lotCode",
            t("lot"),
            <Input
              id="u-lotCode"
              name="lotCode"
              maxLength={LOT_MAX}
              required
              aria-invalid={Boolean(errorFor("lotCode")) || undefined}
              aria-describedby={describedBy("lotCode", true)}
            />,
            t("lotHint"),
          )
        : null}

      <div className="grid gap-5 sm:grid-cols-2">
        {field(
          "issuedOn",
          t("issued"),
          <Input
            id="u-issuedOn"
            name="issuedOn"
            type="date"
            aria-invalid={Boolean(errorFor("issuedOn")) || undefined}
            aria-describedby={describedBy("issuedOn", true)}
          />,
          t("issuedHint"),
        )}
        {type?.perLot
          ? null
          : field(
              "expiresOn",
              t("expires"),
              <Input
                id="u-expiresOn"
                name="expiresOn"
                type="date"
                aria-invalid={Boolean(errorFor("expiresOn")) || undefined}
                aria-describedby={describedBy("expiresOn", true)}
              />,
              t("expiresHint", { months: type?.validityMonths ?? 12 }),
            )}
      </div>

      {field(
        "file",
        t("file"),
        <input
          id="u-file"
          name="file"
          type="file"
          required
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={() => setFileError(null)}
          aria-invalid={Boolean(errorFor("file")) || undefined}
          aria-describedby={describedBy("file", true)}
          className={cn(
            "block w-full rounded-lg border border-input bg-background text-sm file:mr-3 file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-medium file:text-secondary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive",
          )}
        />,
        t("fileHint"),
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          <Upload aria-hidden />
          {t("submit")}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
          {t("cancel")}
        </Link>
        {pending ? (
          <span role="status" className="text-sm text-muted-foreground">
            {t("saving")}
          </span>
        ) : null}
      </div>
    </form>
  );
}
