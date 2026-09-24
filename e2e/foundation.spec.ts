import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const COMPANY = "/alimentos-cordillera";

async function expectNoSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

async function openNav(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: /Abrir menú|Open menu/ }).click();
}

test("home lists the sample companies, marked as sample data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Escoge una empresa" })).toBeVisible();
  await expect(page.getByText("Datos de ejemplo").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Alimentos Cordillera/ })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("a company opens in Spanish with its navigation", async ({ page, isMobile }) => {
  await page.goto(COMPANY);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { level: 1, name: "Panel" })).toBeVisible();
  await expect(page).toHaveTitle("Panel · Stratum");
  await openNav(page, isMobile);
  const nav = page.getByRole("navigation", { name: "Navegación principal" }).last();
  for (const label of ["Panel", "Suplidores", "Documentos", "Solicitudes", "Historial", "Ajustes"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
});

test("navigating to a section marks it as the current page", async ({ page, isMobile }) => {
  await page.goto(COMPANY);
  await openNav(page, isMobile);
  await page
    .getByRole("navigation", { name: "Navegación principal" })
    .last()
    .getByRole("link", { name: "Suplidores" })
    .click();
  await expect(page).toHaveURL(`${COMPANY}/suplidores`);
  await expect(page.getByRole("heading", { level: 1, name: "Suplidores" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("switching to English is remembered after a reload", async ({ page }) => {
  await page.goto(COMPANY);
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Panel" })).toBeVisible();
});

test("the company switcher lists the other companies", async ({ page }) => {
  await page.goto(COMPANY);
  await page.getByRole("button", { name: "Cambiar de empresa" }).click();
  await page.getByRole("menuitem", { name: /Jugos Costa Norte/ }).click();
  await expect(page).toHaveURL("/jugos-costa-norte");
});

test("an unknown company shows a friendly not-found page", async ({ page }) => {
  const response = await page.goto("/empresa-que-no-existe");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
});

test("the component review page renders every piece accessibly", async ({ page }) => {
  await page.goto("/dev/ui");
  await expect(page.getByRole("heading", { level: 1, name: "Revisión de componentes" })).toBeVisible();
  for (const label of ["Vigente", "Por vencer", "Falta"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expectNoSeriousA11yIssues(page);
});
