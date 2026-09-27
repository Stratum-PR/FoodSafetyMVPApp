import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the new toolbar preserves risk and expiry filters and material links", async ({ page }) => {
  await page.goto("/alimentos-cordillera/suplidores?riesgo=high&vence=1");
  await expect(page.getByRole("link", { name: /Quitar filtro: Riesgo/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Quitar filtro: Solo con algo por vencer/ })).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar" }).fill("prueba-inexistente");
  await expect(page).toHaveURL(/q=prueba-inexistente/);
  await expect(page).toHaveURL(/riesgo=high/);
  await expect(page).toHaveURL(/vence=1/);
  await page.getByRole("link", { name: "Quitar filtros", exact: true }).click();
  await expect(page).not.toHaveURL(/riesgo=|vence=|q=/);
  const row = page.locator("main :is(tbody tr, ul[aria-label] > li)").filter({ visible: true }).first();
  await row.locator("a[href*='tab=materiales']").click();
  await expect(page).toHaveURL(/tab=materiales/);
  await expect(page.locator("#matriz")).toBeVisible();
});

test("integrated dashboard, supplier filters and creation form work in English", async ({ page, context, baseURL }) => {
  await page.goto("/alimentos-cordillera");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.goto("/alimentos-cordillera/suplidores");
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Only with something expiring in 30 days" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Add supplier", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add supplier" })).toBeVisible();
  await expect(page.getByLabel("Legal name")).toBeVisible();
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(scan.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Changing companies retains the language but never the supplier list context.
  await context.addCookies([{ name: "preview_role", value: "viewer", url: baseURL! }]);
  await page.goto("/jugos-costa-norte/suplidores/nuevo");
  await expect(page.getByText("Your role can't add suppliers")).toBeVisible();
});
