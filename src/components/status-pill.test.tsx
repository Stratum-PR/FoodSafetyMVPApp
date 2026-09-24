import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { StatusPill } from "./status-pill";

function renderIn(locale: "es" | "en", status: "current" | "expiring" | "expired" | "missing") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <StatusPill status={status} />
    </NextIntlClientProvider>,
  );
}

describe("StatusPill", () => {
  it.each([
    ["current", "Vigente"],
    ["expiring", "Por vencer"],
    ["expired", "Vencido"],
    ["missing", "Falta"],
  ] as const)("shows %s as %s in Spanish", (status, label) => {
    renderIn("es", status);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("uses the English label in English", () => {
    renderIn("en", "expiring");
    expect(screen.getByText("Expiring")).toBeTruthy();
  });

  it("carries the status as data, not only as color", () => {
    const { container } = renderIn("es", "missing");
    expect(container.querySelector('[data-status="missing"]')).not.toBeNull();
  });
});
