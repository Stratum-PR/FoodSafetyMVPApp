import { describe, expect, it } from "vitest";

import { DEFAULT_CATALOG } from "./catalog";
import { checkUpload, MAX_FILE_BYTES, safeFileName, sniffFileType, type UploadInput } from "./upload";

const TODAY = "2026-09-24";
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

function input(extra: Partial<UploadInput> = {}): UploadInput {
  return {
    subject: { kind: "party", partyId: "p1" },
    materialKind: null,
    typeCode: "gfsi_cert",
    lotCode: "",
    issuedOn: "2026-09-01",
    expiresOn: "",
    file: { size: 120_000, head: PDF },
    ...extra,
  };
}
const check = (extra: Partial<UploadInput> = {}) => checkUpload(input(extra), DEFAULT_CATALOG, TODAY);

describe("upload checks", () => {
  it("accepts a valid certificate", () => {
    expect(check()).toEqual({ ok: true, fileType: "application/pdf", issuedOn: "2026-09-01" });
  });

  it("recognizes files by their content, not their name", () => {
    expect(sniffFileType(PDF)).toBe("application/pdf");
    expect(sniffFileType(PNG)).toBe("image/png");
    expect(sniffFileType(JPG)).toBe("image/jpeg");
    expect(sniffFileType(EXE)).toBeNull();
    expect(check({ file: { size: 1000, head: EXE } })).toEqual({ ok: false, errors: { file: "file_type" } });
  });

  it("limits the file size and rejects empty files", () => {
    expect(check({ file: { size: MAX_FILE_BYTES + 1, head: PDF } })).toMatchObject({
      errors: { file: "file_too_large" },
    });
    expect(check({ file: { size: 0, head: PDF } })).toMatchObject({ errors: { file: "file_empty" } });
    expect(check({ file: null })).toMatchObject({ errors: { file: "required" } });
  });

  it("only allows types that fit the supplier or the material", () => {
    expect(check({ typeCode: "spec_sheet" })).toMatchObject({ errors: { typeCode: "type_not_for_subject" } });
    expect(check({ typeCode: "made_up" })).toMatchObject({ errors: { typeCode: "unknown_type" } });
    const material = { subject: { kind: "source", sourceId: "s1" } as const, typeCode: "allergen_statement" };
    expect(check({ ...material, materialKind: "ingredient" }).ok).toBe(true);
    // Packaging has no allergen statement; it has the food-contact letter.
    expect(check({ ...material, materialKind: "packaging" })).toMatchObject({
      errors: { typeCode: "type_not_for_subject" },
    });
    expect(check({ subject: { kind: "source", sourceId: "s1" }, materialKind: "ingredient" })).toMatchObject({
      errors: { typeCode: "type_not_for_subject" },
    });
  });

  it("checks the dates", () => {
    expect(check({ issuedOn: "2026-02-30" })).toMatchObject({ errors: { issuedOn: "invalid_date" } });
    expect(check({ issuedOn: "2026-10-01" })).toMatchObject({ errors: { issuedOn: "future_date" } });
    expect(check({ expiresOn: "2026-08-01" })).toMatchObject({ errors: { expiresOn: "expires_before_issued" } });
    expect(check({ issuedOn: "", expiresOn: "2027-09-01" })).toMatchObject({ ok: true, expiresOn: "2027-09-01" });
  });

  it("requires a lot for per-lot documents and ignores their expiration", () => {
    const coa = {
      subject: { kind: "source", sourceId: "s1" } as const,
      materialKind: "ingredient" as const,
      typeCode: "coa",
    };
    expect(check(coa)).toMatchObject({ errors: { lotCode: "required" } });
    expect(check({ ...coa, lotCode: "L1", expiresOn: "2027-01-01" })).toMatchObject({
      ok: true,
      lotCode: "L1",
      expiresOn: undefined,
    });
    expect(check({ ...coa, lotCode: "x".repeat(41) })).toMatchObject({ errors: { lotCode: "lot_too_long" } });
  });

  it("reports every problem at once", () => {
    const result = check({ subject: null, typeCode: "", file: null });
    expect(result).toEqual({ ok: false, errors: { subject: "required", typeCode: "required", file: "required" } });
  });

  it("makes file names safe for storage", () => {
    expect(safeFileName("Certificado SQF 2026 (Cintrón).PDF", "application/pdf")).toBe(
      "Certificado_SQF_2026_Cintron.pdf",
    );
    expect(safeFileName("../../etc/passwd", "image/png")).toBe("passwd.png");
    expect(safeFileName("C:\\fakepath\\SQF cert.pdf", "application/pdf")).toBe("SQF_cert.pdf");
    expect(safeFileName("....", "image/jpeg")).toBe("documento.jpg");
  });
});
