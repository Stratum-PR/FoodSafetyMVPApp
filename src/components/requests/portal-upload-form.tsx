"use client";

import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, startTransition, useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_FILE_BYTES, type UploadError, type UploadField } from "@/domain/upload";
import type { PortalUploadState } from "@/server/request-actions";

const SELECT =
  "h-11 w-full rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive sm:h-9 sm:text-sm";

/**
 * One requested document, sent from a phone or a computer. Big touch targets; the file input
 * lets phones take a photo. The server checks everything again (type, size, real file kind).
 */
export function PortalUploadForm({
  action,
  itemId,
  types,
}: {
  action: (previous: PortalUploadState, form: FormData) => Promise<PortalUploadState>;
  itemId: string;
  types: { code: string; name: string }[];
}) {
  const t = useTranslations("portal");
  const tUpload = useTranslations("upload.errors");
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [fileError, setFileError] = useState<UploadError | null>(null);
  const errors: Partial<Record<UploadField, UploadError>> = {
    ...(state.status === "invalid" ? state.errors : {}),
    ...(fileError ? { file: fileError } : {}),
  };
  const id = (field: string) => `p-${itemId}-${field}`;

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
  const error = (field: UploadField) =>
    errors[field] ? (
      <p id={id(`${field}-error`)} className="text-sm font-medium text-destructive">
        {tUpload(errors[field]!)}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-4" aria-busy={pending} noValidate>
      {types.length > 1 ? (
        <div className="grid gap-1.5">
          <Label htmlFor={id("type")}>{t("type")}</Label>
          <select
            id={id("type")}
            name="typeCode"
            defaultValue={types[0].code}
            className={SELECT}
            aria-invalid={errors.typeCode ? true : undefined}
          >
            {types.map((type) => (
              <option key={type.code} value={type.code}>
                {type.name}
              </option>
            ))}
          </select>
          {error("typeCode")}
        </div>
      ) : (
        <input type="hidden" name="typeCode" value={types[0]?.code ?? ""} />
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={id("file")}>{t("file")}</Label>
        <Input
          id={id("file")}
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="h-auto py-2"
          aria-invalid={errors.file ? true : undefined}
          aria-describedby={[id("file-hint"), errors.file ? id("file-error") : null].filter(Boolean).join(" ")}
        />
        <p id={id("file-hint")} className="text-xs text-muted-foreground">
          {t("fileHint")}
        </p>
        {error("file")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={id("issued")}>{t("issuedOn")}</Label>
          <Input
            id={id("issued")}
            name="issuedOn"
            type="date"
            className="h-11 sm:h-9"
            aria-invalid={errors.issuedOn ? true : undefined}
          />
          {error("issuedOn")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("expires")}>{t("expiresOn")}</Label>
          <Input
            id={id("expires")}
            name="expiresOn"
            type="date"
            className="h-11 sm:h-9"
            aria-invalid={errors.expiresOn ? true : undefined}
          />
          {error("expiresOn")}
        </div>
      </div>
      {state.status === "denied" ? (
        <p role="alert" className="rounded-lg bg-status-missing-bg px-3 py-2 text-sm font-medium text-status-missing">
          {t(`denial.${state.denial as "not_found"}`)}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="h-11 w-full sm:w-fit">
        <Upload aria-hidden />
        {pending ? t("sending") : t("send")}
      </Button>
    </form>
  );
}
