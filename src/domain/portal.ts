import { addDays, type IsoDate } from "./dates";
import type { DocumentRequest } from "./requests";

/*
 * Supplier request links (no account). The link carries a random secret; only its SHA-256 is
 * stored, so a database leak doesn't leak working links. A link opens exactly one request, for
 * about 30 days, and shows nothing about any other request, supplier or company. Sending a new
 * link revokes the previous one.
 */

export const PORTAL_LINK_DAYS = 30;

export type PortalToken = {
  id: string;
  companySlug: string;
  requestId: string;
  /** SHA-256 of the secret, hex. The secret itself is never stored. */
  tokenHash: string;
  createdAt: string;
  expiresOn: IsoDate;
  revokedAt?: string;
  lastUsedAt?: string;
};

export type PortalDenial = "expired" | "revoked" | "cancelled" | "not_sent";

export function portalExpiry(today: IsoDate): IsoDate {
  return addDays(today, PORTAL_LINK_DAYS);
}

/** Why a link no longer works, or null when it does. Valid through its expiry date. */
export function checkPortalToken(
  token: Pick<PortalToken, "expiresOn" | "revokedAt">,
  request: Pick<DocumentRequest, "state">,
  today: IsoDate,
): PortalDenial | null {
  if (token.revokedAt) return "revoked";
  if (today > token.expiresOn) return "expired";
  if (request.state === "cancelled") return "cancelled";
  if (request.state !== "sent") return "not_sent";
  return null;
}
