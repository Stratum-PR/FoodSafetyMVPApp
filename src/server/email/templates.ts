import "server-only";

import { getFormatter, getTranslations } from "next-intl/server";

import type { EmailTemplate } from "@/domain/notifications";
import { type Locale, timeZone } from "@/i18n/config";

/*
 * Email text, from messages/{es,en}.json ("email"). Every email is bilingual: the contact's
 * language first, then the other, so a forwarded email still reads for everyone.
 */

export type EmailValues = {
  company: string;
  party: string;
  count?: number;
  dueOn?: string;
  expiresOn?: string;
  document?: string;
  link?: string;
  message?: string;
};

async function one(template: EmailTemplate, locale: Locale, values: EmailValues) {
  const t = await getTranslations({ locale, namespace: "email" });
  const format = await getFormatter({ locale });
  const date = (iso?: string) =>
    iso ? format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: "long", timeZone }) : "";
  const v = {
    company: values.company,
    party: values.party,
    count: values.count ?? 0,
    dueOn: date(values.dueOn),
    expiresOn: date(values.expiresOn),
    document: values.document ?? "",
    link: values.link ?? "",
  };
  const lines = [t("greeting", v), "", t(`${template}.body`, v)];
  if (values.message) lines.push("", t("note", { message: values.message }));
  if (values.link) lines.push("", t("linkIntro"), values.link, t("linkPrivate"));
  lines.push("", t("signature", v));
  return { subject: t(`${template}.subject`, v), text: lines.join("\n") };
}

export async function renderEmail(template: EmailTemplate, language: Locale, values: EmailValues) {
  const other: Locale = language === "es" ? "en" : "es";
  const [first, second] = await Promise.all([one(template, language, values), one(template, other, values)]);
  return { subject: `${first.subject} / ${second.subject}`, text: `${first.text}\n\n— — —\n\n${second.text}` };
}
