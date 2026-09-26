import { describe, expect, it } from "vitest";

import {
  conditionsDue,
  expiryOutlook,
  fdaRenewalPeriod,
  fdaRenewalsDue,
  fsvpGaps,
  highRiskGaps,
  isActiveSupplier,
  nonconformityOutlook,
  reviewQueue,
  suspendedWithActiveSources,
} from "./operations";
import type { Requirement, RequirementReason } from "./requirements";
import type { RequirementResult, RequirementStatus } from "./status";
import type { ApprovedSource, Party, SupplierDocument } from "./suppliers";

const TODAY = "2026-09-26";

function result(
  status: RequirementStatus,
  opts: {
    party?: string;
    source?: string;
    anyOf?: string[];
    reason?: RequirementReason;
    expiresOn?: string | null;
    document?: Partial<SupplierDocument>;
  } = {},
): RequirementResult {
  const subject: Requirement["subject"] = opts.source
    ? { kind: "source", sourceId: opts.source }
    : { kind: "party", partyId: opts.party ?? "p1" };
  const anyOf = opts.anyOf ?? ["questionnaire"];
  const document =
    status === "missing"
      ? undefined
      : ({
          id: "d",
          typeCode: anyOf[0],
          subject,
          state: "accepted",
          receivedOn: "2026-01-10",
          uploadedBy: "u",
          ...opts.document,
        } as SupplierDocument);
  return {
    requirement: { key: `${JSON.stringify(subject)}|${anyOf}`, subject, anyOf, reason: opts.reason ?? "manufacturer" },
    status,
    document,
    expiresOn: opts.expiresOn,
  };
}

const party = (id: string, extra: Partial<Party> = {}) =>
  ({ id, approval: "approved", lifecycle: "monitoring", ...extra }) as Party;

function source(id: string, extra: Partial<ApprovedSource> = {}): ApprovedSource {
  return {
    id,
    materialId: `m-${id}`,
    manufacturerId: "mfr",
    distributorId: null,
    status: "active",
    risk: "low",
    ...extra,
  };
}

describe("active suppliers", () => {
  it("counts approved and conditional suppliers that aren't deactivated", () => {
    expect(isActiveSupplier(party("a"))).toBe(true);
    expect(isActiveSupplier(party("a", { approval: "conditional" }))).toBe(true);
    expect(isActiveSupplier(party("a", { approval: "pending", lifecycle: "verification" }))).toBe(false);
    expect(isActiveSupplier(party("a", { approval: "suspended", lifecycle: "suspended" }))).toBe(false);
    expect(isActiveSupplier(party("a", { lifecycle: "inactive" }))).toBe(false);
  });
});

describe("expiry outlook", () => {
  it("groups valid documents by days left, and counts expired and missing apart", () => {
    const outlook = expiryOutlook(
      [
        result("expiring", { expiresOn: "2026-09-26" }), // today: 0 days
        result("expiring", { expiresOn: "2026-10-26" }), // 30
        result("current", { expiresOn: "2026-10-27" }), // 31
        result("current", { expiresOn: "2026-11-25" }), // 60
        result("current", { expiresOn: "2026-12-25" }), // 90
        result("current", { expiresOn: "2026-12-26" }), // 91: not shown
        result("current", { expiresOn: null }), // never expires
        result("expired", { expiresOn: "2026-09-01" }),
        result("missing"),
        result("missing"),
      ],
      TODAY,
    );
    expect(outlook).toEqual({ expired: 1, missing: 2, within30: 2, within60: 2, within90: 1 });
  });
});

describe("review queue", () => {
  it("counts waiting documents and how long the oldest has waited", () => {
    expect(
      reviewQueue(
        [
          { state: "pending_review", receivedOn: "2026-09-20" },
          { state: "pending_review", receivedOn: "2026-09-12" },
          { state: "accepted", receivedOn: "2026-01-01" },
        ],
        TODAY,
      ),
    ).toEqual({ count: 2, oldestDays: 14 });
    expect(reviewQueue([], TODAY)).toEqual({ count: 0, oldestDays: null });
  });
});

describe("conditional approvals due", () => {
  it("lists overdue reviews and those due within 30 days, most urgent first", () => {
    const due = conditionsDue(
      [
        party("later", { approval: "conditional", conditionsReviewBy: "2026-10-26" }),
        party("far", { approval: "conditional", conditionsReviewBy: "2026-10-27" }),
        party("late", { approval: "conditional", conditionsReviewBy: "2026-09-01" }),
        party("gone", { approval: "conditional", lifecycle: "inactive", conditionsReviewBy: "2026-09-01" }),
        party("approved", { conditionsReviewBy: "2026-09-01" }),
      ],
      TODAY,
    );
    expect(due).toEqual([
      { partyId: "late", reviewBy: "2026-09-01", overdue: true },
      { partyId: "later", reviewBy: "2026-10-26", overdue: false },
    ]);
  });
});

describe("nonconformity outlook", () => {
  it("counts the last twelve months by severity and flags three or more per supplier", () => {
    const nc = (partyId: string, date: string, severity: "minor" | "major" | "critical" = "minor") => ({
      partyId,
      date,
      severity,
    });
    const outlook = nonconformityOutlook(
      [
        nc("a", "2026-09-01", "critical"),
        nc("a", "2026-05-01"),
        nc("a", "2025-10-01", "major"),
        nc("b", "2026-08-01"),
        nc("b", "2026-07-01"),
        nc("b", "2025-09-26"), // exactly twelve months ago: outside, like the approval warning
      ],
      TODAY,
    );
    expect(outlook.bySeverity).toEqual({ minor: 3, major: 1, critical: 1 });
    expect(outlook.repeat).toEqual([{ partyId: "a", count: 3 }]);
  });
});

describe("risky sourcing", () => {
  it("finds suspended suppliers that still have active materials", () => {
    const parties = [
      party("s1", { approval: "suspended", lifecycle: "suspended" }),
      party("s2", { approval: "suspended", lifecycle: "suspended" }),
      party("ok"),
    ];
    const sources = [
      source("a", { manufacturerId: "s1" }),
      source("b", { manufacturerId: "x", distributorId: "s1" }),
      source("c", { manufacturerId: "s2", status: "inactive" }),
      source("d", { manufacturerId: "ok" }),
    ];
    expect(suspendedWithActiveSources(parties, sources)).toEqual([{ partyId: "s1", activeSources: 2 }]);
  });

  it("finds active high-risk materials with gaps on the source or its suppliers", () => {
    const sources = [
      source("hi", { risk: "high", distributorId: "dist" }),
      source("hi-ok", { risk: "high", manufacturerId: "clean" }),
      source("lo", { risk: "low" }),
      source("hi-off", { risk: "high", status: "inactive" }),
    ];
    const results = [
      result("missing", { source: "hi" }),
      result("expired", { party: "mfr" }),
      result("missing", { party: "dist" }),
      result("current", { party: "clean" }),
      result("expiring", { source: "hi-ok" }),
    ];
    expect(highRiskGaps(sources, results)).toEqual([
      { sourceId: "hi", materialId: "m-hi", manufacturerId: "mfr", gaps: 3 },
    ]);
  });

  it("lists foreign manufacturers without a valid hazard analysis once each", () => {
    const results = [
      result("missing", { party: "mx", reason: "fsvp", anyOf: ["hazard_analysis"] }),
      result("expired", { party: "cr", reason: "fsvp", anyOf: ["hazard_analysis"] }),
      result("current", { party: "es", reason: "fsvp", anyOf: ["hazard_analysis"] }),
      result("missing", { party: "pr", reason: "manufacturer" }),
    ];
    expect(fsvpGaps(results)).toEqual(["mx", "cr"]);
  });
});

describe("FDA registration renewal", () => {
  it("is October to December of even years", () => {
    expect(fdaRenewalPeriod("2026-09-26")).toEqual({ opensOn: "2026-10-01", closesOn: "2026-12-31", open: false });
    expect(fdaRenewalPeriod("2026-10-01").open).toBe(true);
    expect(fdaRenewalPeriod("2026-12-31").open).toBe(true);
    expect(fdaRenewalPeriod("2027-03-01")).toEqual({ opensOn: "2028-10-01", closesOn: "2028-12-31", open: false });
  });

  it("lists manufacturers whose registration on file predates the period", () => {
    const fda = (status: RequirementStatus, partyId: string, issuedOn?: string) =>
      result(status, { party: partyId, anyOf: ["fda_registration"], document: { issuedOn, receivedOn: "2026-01-05" } });
    const results = [
      fda("current", "old", "2024-11-02"),
      fda("current", "renewed", "2026-10-03"),
      fda("current", "received-only"), // no issue date: the received date counts
      fda("missing", "none"),
      result("missing", { party: "other" }),
    ];
    expect(fdaRenewalsDue(results, "2026-10-01")).toEqual(["old", "received-only", "none"]);
  });
});
