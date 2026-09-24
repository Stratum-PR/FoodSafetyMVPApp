/** A customer company (a tenant). Everything a company owns lives under its slug. */
export type Company = {
  /** URL identifier: app.stratumpr.com/{slug}/… */
  slug: string;
  name: string;
  city: string;
  businessType: "manufacturer" | "co-packer" | "brand" | "distributor";
};

/** Company slugs: lowercase letters, digits and single hyphens, 3–48 characters. */
export function isValidCompanySlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 48;
}
