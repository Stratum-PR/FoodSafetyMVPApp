import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHECKLIST_ITEMS } from "@/domain/suppliers";

/*
 * The whole request loop through the services, on sample data: build a request from real gaps,
 * send it (outbox only), the supplier opens the link and uploads, the reviewer rejects (the
 * reason reaches the request item), the supplier sends again, the reviewer accepts, the
 * obligation turns current and the request completes. Plus link isolation and reminder idempotency.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
// Email text needs Next's request scope; the flow only needs something to log.
vi.mock("./email/templates", () => ({
  renderEmail: vi.fn(async (template: string) => ({ subject: template, text: template })),
}));

process.env.LOCAL_FILE_DIR = mkdtempSync(path.join(tmpdir(), "stratum-flow-"));

const { todayIn } = await import("@/domain/dates");
const { timeZone } = await import("@/i18n/config");
const { SAMPLE_COMPANIES } = await import("./sample/companies");
const { getSampleStore, resetSampleStore } = await import("./sample/store");
const { getWorkflowStore, resetWorkflowStore } = await import("./sample/workflow-store");
const requests = await import("./requests");
const portal = await import("./portal");
const documents = await import("./documents");
const scan = await import("./daily-scan");

// The portal reads "today" from the clock, so the flow runs on the real date.
const TODAY = todayIn(timeZone);
const company = SAMPLE_COMPANIES[1];
const ctx = { company, actor: { userId: "u-sample", role: "quality_manager" as const }, today: TODAY };
const ORIGIN = "https://app.example";
const PDF = () =>
  new File(
    [Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")],
    "guarantee.pdf",
    {
      type: "application/pdf",
    },
  );
const secretOf = (link: string) => link.slice(link.lastIndexOf("/") + 1);

beforeEach(() => {
  resetSampleStore();
  resetWorkflowStore();
});

/** A supplier with a missing guarantee letter (a party-level item with a single document type). */
async function target() {
  const targets = await requests.listRequestTargets(ctx);
  for (const t of targets) {
    const gap = t.gaps.find((g) => g.code === "guarantee_letter" && g.status === "missing" && !g.requested);
    if (gap && t.contacts.length) return { t, gap };
  }
  throw new Error("no sample supplier with a missing guarantee letter");
}

describe("request → supplier link → review", () => {
  it("runs the whole loop and updates the obligation", async () => {
    const { t, gap } = await target();
    const created = await requests.createRequest(
      ctx,
      {
        partyId: t.partyId,
        contactId: t.contacts[0].id,
        requirementKeys: [gap.key],
        dueOn: requests.defaultDueOn(TODAY),
        language: "es",
        message: "",
        send: true,
      },
      ORIGIN,
    );
    if (!created.ok) throw new Error(JSON.stringify(created.errors));
    expect(created.link).toMatch(/^https:\/\/app\.example\/portal\/[A-Za-z0-9_-]{40,}$/);

    const flow = getWorkflowStore(company.slug, TODAY);
    // The email was logged, never sent: no provider is configured.
    expect(flow.emailLog).toMatchObject([{ template: "request", status: "logged", toEmail: t.contacts[0].email }]);
    expect(flow.emailLog[0].providerId).toMatch(/^outbox-/);
    // Only the hash of the secret is stored.
    const secret = secretOf(created.link!);
    expect(JSON.stringify(flow.tokens)).not.toContain(secret);
    expect((await requests.getRequest(ctx, created.id))?.status).toBe("sent");

    // The supplier opens the link: only this request, its item, and no other supplier's data.
    const opened = await portal.openPortal(secret);
    if (!opened.ok) throw new Error(opened.denial);
    expect(opened.view.items).toHaveLength(1);
    expect(opened.view.partyName).toBe(t.partyName);
    expect(JSON.stringify(opened.view)).not.toMatch(/"partyId"/);
    const itemId = opened.view.items[0].id;

    // Upload: the item waits for review; the obligation is NOT met by an unreviewed upload.
    const up = await portal.portalUpload(secret, {
      itemId,
      typeCode: "guarantee_letter",
      issuedOn: "",
      expiresOn: "",
      file: PDF(),
    });
    expect(up).toEqual({ ok: true });
    const store = getSampleStore(company.slug, TODAY);
    const doc1 = store.documents.at(-1)!;
    expect(doc1).toMatchObject({ receivedVia: "portal", state: "pending_review", requestItemId: itemId });
    expect(doc1.file?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const obligation = () => requests.obligationsOf(store, TODAY).find((o) => o.requirement.key === gap.key)!;
    expect(obligation().status).toBe("awaiting_review");
    expect((await requests.getRequest(ctx, created.id))?.status).toBe("awaiting_review");
    // The requester was notified.
    expect(flow.notifications.some((n) => n.kind === "portal_upload" && n.userId === "u-sample")).toBe(true);
    // A second upload for the same item waits until this one is decided.
    expect(
      await portal.portalUpload(secret, {
        itemId,
        typeCode: "guarantee_letter",
        issuedOn: "",
        expiresOn: "",
        file: PDF(),
      }),
    ).toEqual({ ok: false, denial: "not_waiting" });

    // Reject: the reason goes back to the supplier's item.
    expect(await documents.decideDocument(ctx, doc1.id, "reject", "Falta la firma del representante.")).toEqual({
      ok: true,
      superseded: 0,
    });
    const reopened = await portal.openPortal(secret);
    expect(reopened.ok && reopened.view.items[0]).toMatchObject({
      status: "rejected",
      rejectionReason: "Falta la firma del representante.",
    });
    expect((await requests.getRequest(ctx, created.id))?.status).toBe("rejected_items");

    // Resubmit, then accept with the checklist.
    await portal.portalUpload(secret, {
      itemId,
      typeCode: "guarantee_letter",
      issuedOn: "",
      expiresOn: "",
      file: PDF(),
    });
    const doc2 = store.documents.at(-1)!;
    expect((await requests.getRequest(ctx, created.id))?.items[0].status).toBe("resubmitted");
    const accepted = await documents.decideDocument(ctx, doc2.id, "accept", "", { checklist: [...CHECKLIST_ITEMS] });
    expect(accepted.ok).toBe(true);

    expect(obligation().status).toMatch(/current|expiring/);
    const done = await requests.getRequest(ctx, created.id);
    expect(done?.status).toBe("complete");
    expect(done?.items[0].documents.map((d) => d.state)).toEqual(["rejected", "accepted"]);
    // Every step is on record.
    expect(done?.events.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        "request.created",
        "request.link_created",
        "request.sent",
        "portal.opened",
        "portal.uploaded",
      ]),
    );
  });

  it("builds requests only from real gaps, and never twice for the same gap", async () => {
    const { t, gap } = await target();
    const base = {
      partyId: t.partyId,
      contactId: t.contacts[0].id,
      dueOn: requests.defaultDueOn(TODAY),
      language: "es",
      message: "",
      send: false,
    };
    expect(await requests.createRequest(ctx, { ...base, requirementKeys: ["made-up"] }, ORIGIN)).toMatchObject({
      ok: false,
      errors: { requirementKeys: "not_a_gap" },
    });
    const draft = await requests.createRequest(ctx, { ...base, requirementKeys: [gap.key] }, ORIGIN);
    expect(draft).toMatchObject({ ok: true });
    expect(draft.ok && (await requests.getRequest(ctx, draft.id))?.status).toBe("draft");
    expect(await requests.createRequest(ctx, { ...base, requirementKeys: [gap.key] }, ORIGIN)).toMatchObject({
      errors: { requirementKeys: "already_requested" },
    });
  });

  it("scopes a link to its request: bad, replaced and cancelled links show nothing", async () => {
    const { t, gap } = await target();
    const created = await requests.createRequest(
      ctx,
      {
        partyId: t.partyId,
        contactId: t.contacts[0].id,
        requirementKeys: [gap.key],
        dueOn: requests.defaultDueOn(TODAY),
        language: "en",
        message: "",
        send: true,
      },
      ORIGIN,
    );
    if (!created.ok) throw new Error("create failed");
    const old = secretOf(created.link!);
    expect(await portal.openPortal("x".repeat(43))).toEqual({ ok: false, denial: "not_found" });
    expect(await portal.openPortal("../../etc")).toEqual({ ok: false, denial: "not_found" });

    const fresh = secretOf((await requests.regenerateLink(ctx, created.id, ORIGIN)).link);
    expect(await portal.openPortal(old)).toEqual({ ok: false, denial: "revoked" });
    expect((await portal.openPortal(fresh)).ok).toBe(true);

    expect(await requests.cancelRequest(ctx, created.id, "Ya no le compramos.")).toEqual({ ok: true });
    expect(await portal.openPortal(fresh)).toEqual({ ok: false, denial: "revoked" });
    expect((await requests.getRequest(ctx, created.id))?.status).toBe("cancelled");
  });

  it("needs the permission to send requests", async () => {
    const viewer = { ...ctx, actor: { userId: "v", role: "viewer" as const } };
    await expect(requests.listRequests(viewer)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("daily scan", () => {
  it("sends each reminder once, even when run twice", async () => {
    const first = await scan.runDailyScan(company, TODAY);
    const flow = getWorkflowStore(company.slug, TODAY);
    const emails = flow.emailLog.length;
    expect(first).toBeGreaterThan(0);
    expect(await scan.runDailyScan(company, TODAY)).toBe(0);
    expect(flow.emailLog).toHaveLength(emails);
    expect(flow.emailLog.every((e) => e.status === "logged")).toBe(true);
    expect(await scan.ensureDailyScan(company, TODAY)).toBe(0);
  });
});
