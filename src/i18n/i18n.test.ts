import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { compareMessages } from "./check";
import { resolveLocale } from "./config";

describe("messages", () => {
  it("has an English version of every Spanish text, with the same placeholders", () => {
    expect(compareMessages(es, en)).toEqual([]);
  });

  it("detects missing keys, empty strings and placeholder mismatches", () => {
    const problems = compareMessages(
      { a: "Hola", b: "Referencia: {code}", c: { d: "x" } },
      { a: "", b: "Reference: {id}" },
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        { kind: "empty", key: "a", in: "en" },
        { kind: "placeholders", key: "b", source: ["code"], translation: ["id"] },
        { kind: "missing", key: "c.d", in: "en" },
      ]),
    );
  });
});

describe("resolveLocale", () => {
  it("uses the saved choice first", () => {
    expect(resolveLocale("en", "es-PR,es;q=0.9")).toBe("en");
  });

  it("falls back to the browser language", () => {
    expect(resolveLocale(undefined, "en-US,en;q=0.9,es;q=0.5")).toBe("en");
    expect(resolveLocale(undefined, "fr-FR,es;q=0.8,en;q=0.5")).toBe("es");
  });

  it("defaults to Spanish", () => {
    expect(resolveLocale(undefined, null)).toBe("es");
    expect(resolveLocale("de", "fr,de")).toBe("es");
  });
});
