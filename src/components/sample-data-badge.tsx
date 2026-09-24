import { FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";

/** Shown whenever the app runs on fictional data, so no one mistakes it for a real customer's. */
export function SampleDataBadge() {
  const t = useTranslations("sample");
  return (
    <span
      title={t("hint")}
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-sand-soft px-2.5 py-1 text-xs font-semibold text-brand-olive"
    >
      <FlaskConical aria-hidden className="size-3.5" />
      {t("badge")}
    </span>
  );
}
