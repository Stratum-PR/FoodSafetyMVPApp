import type { Party, PartyType } from "./suppliers";

/*
 * Adding a supplier. A new supplier starts in onboarding, pending approval: it can't be bought
 * from until someone with approval rights decides (21 CFR 117.410(d), SQF 2.4.4).
 */

export const PARTY_TYPES = ["manufacturer", "distributor", "both"] as const satisfies readonly PartyType[];

/** Countries offered first; any ISO 3166 alpha-2 code is accepted. */
export const COMMON_COUNTRIES = ["PR", "US", "DO", "MX", "CR", "CO", "ES", "CA", "BR", "CL", "PE", "CN", "IN"];

export const NAME_MIN = 2;
export const NAME_MAX = 120;
export const CITY_MAX = 80;

export type NewSupplierInput = { name: string; type: string; city: string; country: string; fei: string };
export type NewSupplierField = keyof NewSupplierInput;
export type NewSupplierError = "required" | "too_short" | "too_long" | "invalid" | "duplicate";

export type NewSupplier = Pick<Party, "name" | "type" | "city" | "country" | "fei">;

export type NewSupplierCheck =
  { ok: true; value: NewSupplier } | { ok: false; errors: Partial<Record<NewSupplierField, NewSupplierError>> };

/** Same name ignoring case, accents, punctuation and spacing ("Cintrón, Inc." = "cintron inc"). */
export function sameName(a: string, b: string): boolean {
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
  return fold(a) === fold(b);
}

export function checkNewSupplier(input: NewSupplierInput, existingNames: string[]): NewSupplierCheck {
  const errors: Partial<Record<NewSupplierField, NewSupplierError>> = {};

  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) errors.name = "required";
  else if (name.length < NAME_MIN) errors.name = "too_short";
  else if (name.length > NAME_MAX) errors.name = "too_long";
  else if (existingNames.some((n) => sameName(n, name))) errors.name = "duplicate";

  if (!input.type) errors.type = "required";
  else if (!(PARTY_TYPES as readonly string[]).includes(input.type)) errors.type = "invalid";

  const city = input.city.trim().replace(/\s+/g, " ");
  if (!city) errors.city = "required";
  else if (city.length > CITY_MAX) errors.city = "too_long";

  const country = input.country.trim().toUpperCase();
  if (!country) errors.country = "required";
  else if (!/^[A-Z]{2}$/.test(country)) errors.country = "invalid";

  // FDA Establishment Identifiers are 7 to 10 digits.
  const fei = input.fei.replace(/\s+/g, "");
  if (fei && !/^\d{7,10}$/.test(fei)) errors.fei = "invalid";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, type: input.type as PartyType, city, country, fei: fei || undefined } };
}
