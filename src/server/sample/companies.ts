import type { Company } from "@/domain/company";

/**
 * Fictional sample companies. Never use real customer or supplier names or data here:
 * this data is shown to prospects.
 */
export const SAMPLE_COMPANIES: Company[] = [
  { slug: "alimentos-cordillera", name: "Alimentos Cordillera", city: "Cayey, PR", businessType: "manufacturer" },
  { slug: "jugos-costa-norte", name: "Jugos Costa Norte", city: "Arecibo, PR", businessType: "co-packer" },
  { slug: "dulces-la-palma", name: "Dulces La Palma", city: "Ponce, PR", businessType: "brand" },
];
