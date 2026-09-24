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
  for (const label of ["Vigente", "Por vencer", "Vencido", "Falta"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expectNoSeriousA11yIssues(page);
});

test("previewing as another role changes what the menu shows", async ({ page, isMobile }) => {
  await page.goto(COMPANY);
  await page.getByRole("button", { name: "Menú de usuario" }).click();
  await expect(page.getByTestId("current-role")).toHaveText("Gerente de calidad");
  await page.getByRole("menuitemradio", { name: "Solo lectura" }).click();
  await expect(page.getByTestId("current-role")).toHaveText("Solo lectura");
  await page.keyboard.press("Escape");

  await openNav(page, isMobile);
  const nav = page.getByRole("navigation", { name: "Navegación principal" }).last();
  await expect(nav.getByRole("link", { name: "Suplidores" })).toBeVisible();
  for (const hidden of ["Solicitudes", "Historial", "Ajustes"]) {
    await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
  }

  await page.goto(`${COMPANY}/ajustes`);
  await expect(page.getByText("Tu rol no tiene acceso a esta sección")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("the panel summarizes compliance and expirations", async ({ page }) => {
  await page.goto(COMPANY);
  await expect(page.getByText("Cumplimiento", { exact: true })).toBeVisible();
  await expect(page.getByText(/\d+ de \d+ requisitos al día/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vencimientos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Menor cumplimiento" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("link", { name: /Ver suplidores con pendientes/ }).click();
  await expect(page).toHaveURL(/suplidores\?pendientes=1/);
  await expect(page.getByLabel("Solo con documentos pendientes")).toBeChecked();
});

test("the supplier list searches and filters from the URL", async ({ page }) => {
  await page.goto(`${COMPANY}/suplidores`);
  await expect(page.getByText(/^44 suplidores de 44$/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByLabel("Tipo").selectOption("distributor");
  await expect(page).toHaveURL(/tipo=distributor/);
  await expect(page.getByText(/^\d+ suplidores de 44$/)).not.toHaveText("44 suplidores de 44");

  await page.goto(`${COMPANY}/suplidores?q=no-existe-este-nombre`);
  await expect(page.getByText("Ningún suplidor coincide con los filtros")).toBeVisible();
  await page.getByRole("link", { name: "Quitar filtros" }).click();
  await expect(page.getByText(/^44 suplidores de 44$/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("clicking a column name sorts the supplier list, and again reverses it", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones sort with the 'Ordenar por' control; column headers are desktop only.");
  await page.goto(`${COMPANY}/suplidores`);
  const header = page.getByRole("columnheader", { name: "Materiales activos" });
  await expect(header).toHaveAttribute("aria-sort", "none");

  await header.getByRole("link").click();
  await expect(page).toHaveURL(/orden=materiales&dir=asc/);
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  const asc = await page.locator("table tbody tr td:nth-child(4)").allTextContents();
  expect(asc.map(Number)).toEqual([...asc.map(Number)].sort((a, b) => a - b));

  await header.getByRole("link").click();
  await expect(page).toHaveURL(/orden=materiales&dir=desc/);
  await expect(header).toHaveAttribute("aria-sort", "descending");
  const desc = await page.locator("table tbody tr td:nth-child(4)").allTextContents();
  expect(desc.map(Number)).toEqual([...desc.map(Number)].sort((a, b) => b - a));

  // Sorting keeps the filters, and filtering keeps the sort.
  await page.getByLabel("Solo con documentos pendientes").check();
  await expect(page).toHaveURL(/pendientes=1/);
  await expect(page).toHaveURL(/orden=materiales&dir=desc/);
  await page.getByRole("columnheader", { name: "Suplidor" }).getByRole("link").click();
  await expect(page).toHaveURL(/pendientes=1.*orden=nombre&dir=asc/);
});

test("phones sort with the sort control", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone-only control.");
  await page.goto(`${COMPANY}/suplidores`);
  await page.getByLabel("Ordenar por").selectOption("nombre");
  await expect(page).toHaveURL(/orden=nombre/);
  const names = await page.locator("ul[aria-label] > li a").allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "es")));
});

test("a supplier page shows its requirements, materials and documents", async ({ page }) => {
  await page.goto(`${COMPANY}/suplidores`);
  const first = page.getByRole("link", { name: /Inc\.|S\.A\./ }).first();
  const name = (await first.textContent())!.trim();
  await first.click();

  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page).toHaveTitle(`${name} · Stratum`);
  for (const section of ["Documentos del suplidor", "Materiales", "Documentos recibidos"]) {
    await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("link", { name: "Suplidores" }).first().click();
  await expect(page).toHaveURL(`${COMPANY}/suplidores`);
});

test("an unknown supplier shows a friendly page inside the app", async ({ page }) => {
  const response = await page.goto(`${COMPANY}/suplidores/no-existe`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "No encontramos este suplidor" })).toBeVisible();
  await page.getByRole("link", { name: "Suplidores" }).last().click();
  await expect(page).toHaveURL(`${COMPANY}/suplidores`);
});
