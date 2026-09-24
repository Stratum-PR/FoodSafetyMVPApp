export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];

/** Spanish is the product's primary language. */
export const defaultLocale: Locale = "es";

/** Cookie that remembers the user's language choice (set by the language switch). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Business time zone for dates shown in the app. */
export const timeZone = "America/Puerto_Rico";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * Picks the language for a request: the saved choice first, then the browser's
 * Accept-Language header, then Spanish.
 */
export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  const preferred = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((entry) => entry.lang && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q);
  const match = preferred.find((entry) => isLocale(entry.lang));
  return match ? (match.lang as Locale) : defaultLocale;
}
