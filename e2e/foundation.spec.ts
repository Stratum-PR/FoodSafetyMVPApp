import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const COMPANY = "/alimentos-cordillera";

async function expectNoSeriousA11yIssues(page: Page) {
  // Next streams the <title> from async generateMetadata just after the content; wait for it.
  await expect.poll(() => page.title()).not.toBe("");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // The inside of the browser's own PDF viewer (document previews) isn't ours; the frame itself is checked.
    .exclude('iframe[src$="/archivo"]')
    .analyze();
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
  await expect(page.getByRole("link", { name: "Quitar filtro: Solo con documentos pendientes" })).toBeVisible();
});

test("the panel separates what needs action from the indicators", async ({ page }) => {
  await page.goto(COMPANY);
  await expect(page.getByRole("heading", { level: 2, name: "Para atender" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Indicadores" })).toBeVisible();
  for (const card of [
    "Renovación del registro FDA",
    "Suspendidos con materiales activos",
    "Materiales de alto riesgo con faltas",
    "FSVP: falta el análisis de peligros",
    "No conformidades (12 meses)",
  ]) {
    await expect(page.getByRole("heading", { name: card })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectNoSeriousA11yIssues(page);
});

test("the active suppliers tile opens the list of active suppliers", async ({ page }) => {
  await page.goto(COMPANY);
  const tile = page.getByRole("link", { name: /Suplidores activos/ });
  const active = (await tile.locator("p.text-3xl").textContent())?.trim();
  await tile.click();
  await expect(page).toHaveURL(/suplidores\?estado=active/);
  await expect(
    page.getByRole("link", { name: "Quitar filtro: Estado: Activos (aprobados o condicionales)" }),
  ).toBeVisible();
  await expect(page.getByText(new RegExp(`^${active} suplidores de \\d+$`))).toBeVisible();
});

test("the supplier list filters from its cards, the filter menu and the search", async ({ page }) => {
  await page.goto(`${COMPANY}/suplidores`);
  await expect(page.getByText(/^44 suplidores de 44$/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("link", { name: /Distribuidores/ }).click();
  await expect(page).toHaveURL(/tipo=distributor/);
  await expect(page.getByRole("link", { name: /Distribuidores/ })).toHaveAttribute("aria-current", "true");
  await expect(page.getByText(/^\d+ suplidores de 44$/)).not.toHaveText("44 suplidores de 44");

  // Picking a filter applies it at once; there is no Apply button.
  await page.getByRole("button", { name: "Filtros" }).click();
  await page.getByRole("menuitemradio", { name: "Pendiente" }).click();
  await expect(page).toHaveURL(/tipo=distributor.*aprobacion=pending|aprobacion=pending.*tipo=distributor/);
  await expect(page.getByRole("link", { name: "Quitar filtro: Aprobación: Pendiente" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar" })).toHaveCount(0);

  // Search applies once typing pauses.
  await page.getByRole("searchbox", { name: "Buscar" }).fill("no-existe-este-nombre");
  await expect(page).toHaveURL(/q=no-existe-este-nombre/);
  await expect(page.getByText("Ningún suplidor coincide con los filtros")).toBeVisible();
  await page.getByRole("link", { name: "Quitar filtros" }).click();
  await expect(page.getByText(/^44 suplidores de 44$/)).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Buscar" })).toHaveValue("");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the supplier list pages through suppliers", async ({ page }) => {
  await page.goto(`${COMPANY}/suplidores`);
  await expect(page.getByText("Página 1 de 3")).toBeVisible();
  await page.getByRole("link", { name: "Siguiente" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(page.getByText("Página 2 de 3")).toBeVisible();
});

test("clicking anywhere on a supplier's row opens it", async ({ page, isMobile }) => {
  await page.goto(`${COMPANY}/suplidores?orden=nombre&dir=asc`);
  const row = isMobile ? page.locator("ul[aria-label] > li").first() : page.locator("table tbody tr").first();
  const name = (await row.locator("a:not([aria-hidden])").first().textContent())!.trim();
  // Click away from the name: on the compliance bar on computers, the card's lower edge on phones.
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 12);
  await expect(page).toHaveURL(/\/suplidores\/[^?]+/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});

test("adding a supplier checks the form and opens its new page", async ({ page }) => {
  // Another company, so the 44-supplier list the other tests count stays the same.
  const company = "/dulces-la-palma";
  await page.goto(`${company}/suplidores`);
  await page.getByRole("link", { name: "Agregar suplidor" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Agregar suplidor" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("button", { name: "Agregar suplidor" }).click();
  await expect(page.getByText("Este campo es obligatorio.").first()).toBeVisible();

  const name = `Harinas de Prueba ${Math.random().toString(36).slice(2, 8)} Inc.`;
  await page.getByLabel("Nombre legal").fill(name);
  await page.getByLabel("Manufacturero y distribuidor").check();
  await page.getByLabel("Ciudad").fill("Caguas");
  await page.getByLabel("FDA FEI (opcional)").fill("3012345678");
  await page.getByRole("button", { name: "Agregar suplidor" }).click();

  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText(/Suplidor agregado/)).toBeVisible();
  await expect(page.getByText("Todavía no tiene requisitos")).toBeVisible();

  // The same name again is refused.
  await page.goto(`${company}/suplidores/nuevo`);
  await page.getByLabel("Nombre legal").fill(name.toUpperCase());
  await page.getByLabel("Manufacturero", { exact: true }).check();
  await page.getByLabel("Ciudad").fill("Caguas");
  await page.getByRole("button", { name: "Agregar suplidor" }).click();
  await expect(page.getByText("Ya hay un suplidor con este nombre.")).toBeVisible();
});

test("a read-only role can't add suppliers", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "preview_role", value: "viewer", url: baseURL! }]);
  await page.goto(`${COMPANY}/suplidores`);
  await expect(page.getByRole("link", { name: "Agregar suplidor" })).toHaveCount(0);
  await page.goto(`${COMPANY}/suplidores/nuevo`);
  await expect(page.getByText("Tu rol no puede agregar suplidores")).toBeVisible();
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
  await page.getByRole("button", { name: "Filtros" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Solo con documentos pendientes" }).click();
  await expect(page).toHaveURL(/pendientes=1/);
  await expect(page).toHaveURL(/orden=materiales&dir=desc/);
  await page.getByRole("columnheader", { name: "Suplidor" }).getByRole("link").click();
  await expect(page).toHaveURL(/pendientes=1.*orden=nombre&dir=asc/);
});

test("phones sort with the sort control", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone-only control.");
  await page.goto(`${COMPANY}/suplidores`);
  await page.getByRole("button", { name: "Ordenar por" }).click();
  await page.getByRole("menuitemradio", { name: "Suplidor" }).click();
  await expect(page).toHaveURL(/orden=nombre/);
  const names = await page.locator("ul[aria-label] > li a:not([aria-hidden])").allTextContents();
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

/*
 * Document review changes the shared in-memory sample data, and desktop and phone run at
 * the same time. So these tests read the queue when they start, and
 * take documents from opposite ends of it (desktop from the front, phone from the back).
 */
// The main sample company: 14 documents others uploaded, enough for these tests and retries.
const REVIEW_COMPANY = COMPANY;

async function reviewableDocuments(page: Page): Promise<string[]> {
  await page.goto(`${REVIEW_COMPANY}/documentos`);
  const rows = page.locator("main :is(tbody tr, ul[aria-label='Documentos'] > li)").filter({ visible: true });
  const hrefs: string[] = [];
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    // "(tú)" marks your own uploads, which you can't review.
    if ((await row.innerText()).includes("(tú)")) continue;
    hrefs.push((await row.locator("a[href*='/documentos/']").first().getAttribute("href"))!);
  }
  return hrefs;
}

const pick = (hrefs: string[], isMobile: boolean, offset: number) =>
  isMobile ? hrefs[hrefs.length - 1 - offset] : hrefs[offset];

test("the documents page opens on the review queue", async ({ page }) => {
  await page.goto(`${COMPANY}/documentos`);
  await expect(page.getByRole("link", { name: /Por revisar/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/Los más antiguos primero/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("link", { name: /Aceptados/ }).click();
  // The accepted list is long (about 240 rows); give it time when many tests run at once.
  await expect(page).toHaveURL(/estado=aceptados/, { timeout: 15_000 });
  await expect(page.getByText("Aceptado", { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test("rejecting a document needs a reason and records who rejected it", async ({ page, isMobile }) => {
  const href = pick(await reviewableDocuments(page), isMobile, 0);
  await page.goto(href);
  await page.getByRole("button", { name: "Rechazar" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(/Escribe el motivo del rechazo/);
  await expectNoSeriousA11yIssues(page);

  await page.getByLabel("Motivo del rechazo").fill("Falta la firma del gerente de calidad.");
  await page.getByRole("button", { name: "Rechazar" }).click();
  await expect(page.getByText(/Rechazado por Usuario de ejemplo/)).toBeVisible();
  await expect(page.getByText("Falta la firma del gerente de calidad.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aceptar" })).toHaveCount(0);

  const queue = await reviewableDocuments(page);
  expect(queue).not.toContain(href);
});

test("accepting a document takes it out of the queue", async ({ page, isMobile }) => {
  const href = pick(await reviewableDocuments(page), isMobile, 1);
  await page.goto(href);
  await page.getByRole("button", { name: "Aceptar" }).click();
  await expect(page.getByText(/Aceptado por Usuario de ejemplo/)).toBeVisible();
  expect(await reviewableDocuments(page)).not.toContain(href);
});

test("small teams can review a document they uploaded themselves", async ({ page, isMobile }) => {
  await page.goto(`${REVIEW_COMPANY}/documentos`);
  // Your own sample uploads (oldest first); desktop and phone each take a different one.
  const mine = page
    .locator("main :is(tbody tr, ul[aria-label='Documentos'] > li)")
    .filter({ visible: true })
    .filter({ hasText: "(tú)" })
    .nth(isMobile ? 1 : 0);
  await mine.locator("a[href*='/documentos/']").first().click();
  await expect(page.getByText(/Tú subiste este documento/)).toHaveCount(0);
  await page.getByRole("button", { name: "Aceptar" }).click();
  await expect(page.getByText(/Aceptado por Usuario de ejemplo/)).toBeVisible();
});

test("a read-only role sees documents but can't review them", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "preview_role", value: "viewer", url: baseURL! }]);
  // From the middle of the queue: the deciding tests take from the ends.
  const queue = await reviewableDocuments(page);
  const href = queue[Math.floor(queue.length / 2)];
  await page.goto(href);
  await expect(page.getByText("Tu rol no puede aceptar ni rechazar documentos.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rechazar" })).toHaveCount(0);
});

test("an unknown document shows a friendly page inside the app", async ({ page }) => {
  const response = await page.goto(`${COMPANY}/documentos/no-existe`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "No encontramos este documento" })).toBeVisible();
});

test("a replaced document stays on file and shows its full history", async ({ page }) => {
  // A company no other test changes, so its history is exactly the sample data.
  await page.goto("/jugos-costa-norte/documentos?estado=reemplazados");
  const row = page.locator("main :is(tbody tr, ul[aria-label='Documentos'] > li)").filter({ visible: true }).first();
  await row.locator("a[href*='/documentos/']").first().click();

  await expect(page.getByText("Reemplazado por un documento más reciente.")).toBeVisible();
  const history = page.getByRole("heading", { level: 2, name: "Historial de este documento" });
  await expect(history).toBeVisible();
  await expect(page.getByText("Estás viendo esta").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Activa", { exact: true }).filter({ visible: true })).toHaveCount(1);
  await expectNoSeriousA11yIssues(page);

  // The active version is one click away, and lists this one in its history too.
  const before = page.url();
  await page
    .locator("main :is(tbody tr, ul[aria-label='Versiones del documento'] > li)")
    .filter({ visible: true })
    .filter({ hasText: "Activa" })
    .locator("a")
    .first()
    .click();
  await expect(page).not.toHaveURL(before);
  await expect(page.getByText(/Aceptado por /)).toBeVisible();
  await expect(page.getByText("Reemplazado", { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

/* Upload. The files are made in memory: a tiny real PDF, and a text file pretending to be one. */
const PDF_FILE = {
  name: "Certificado GFSI 2026.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"),
};
const FAKE_PDF = { name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") };

async function fillUpload(page: Page) {
  await page.goto(`${COMPANY}/documentos`);
  await page.getByRole("link", { name: "Subir documento" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Subir documento" })).toBeVisible();
  await page.getByLabel("Suplidor").selectOption({ index: 1 });
  await page.getByLabel("Tipo de documento").selectOption("gfsi_cert");
  await page.getByLabel("Fecha de emisión").fill("2026-09-01");
}

test("an uploaded document goes to review, and the same person can accept it", async ({ page }) => {
  await fillUpload(page);
  await expectNoSeriousA11yIssues(page);
  await page.getByLabel("Archivo").setInputFiles(PDF_FILE);
  await page.getByRole("button", { name: "Subir para revisión" }).click();

  await expect(page).toHaveURL(/\/documentos\/up-/);
  await expect(page.getByText("Por revisar").first()).toBeVisible();
  await expect(page.getByText("Certificado_GFSI_2026.pdf", { exact: false })).toBeVisible();

  // The file comes back as the same PDF, private and never cached.
  const file = await page.request.get(`${page.url()}/archivo`);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("application/pdf");
  expect(file.headers()["cache-control"]).toBe("private, no-store");
  expect((await file.body()).toString()).toBe(PDF_FILE.buffer.toString());

  // Small teams: the person who uploaded it may accept it.
  await page.getByRole("button", { name: "Aceptar" }).click();
  await expect(page.getByText(/Aceptado por Usuario de ejemplo/)).toBeVisible();
});

test("upload refuses a file that only pretends to be a PDF, and keeps the form", async ({ page }) => {
  await fillUpload(page);
  await page.getByLabel("Archivo").setInputFiles(FAKE_PDF);
  await page.getByRole("button", { name: "Subir para revisión" }).click();
  await expect(page.getByText(/Solo PDF, JPG o PNG/)).toBeVisible();
  await expect(page).toHaveURL(/\/documentos\/subir/);
  await expect(page.getByLabel("Tipo de documento")).toHaveValue("gfsi_cert");
  await expect(page.getByLabel("Fecha de emisión")).toHaveValue("2026-09-01");
});

test("a read-only role can't upload", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "preview_role", value: "viewer", url: baseURL! }]);
  await page.goto(`${COMPANY}/documentos`);
  await expect(page.getByRole("link", { name: "Subir documento" })).toHaveCount(0);
  await page.goto(`${COMPANY}/documentos/subir`);
  await expect(page.getByText("Tu rol no puede subir documentos")).toBeVisible();
});

/* Supplier approval. Uses its own company; desktop and phone take different suppliers. */
const APPROVAL_COMPANY = "/dulces-la-palma";

async function openSupplier(page: Page, query: string, isMobile: boolean) {
  await page.goto(`${APPROVAL_COMPANY}/suplidores?${query}`);
  const links = page
    .locator("main :is(tbody tr, ul[aria-label] > li)")
    .filter({ visible: true })
    .locator("a[href*='/suplidores/p-']:not([aria-hidden])");
  const count = await links.count();
  await links.nth(isMobile ? count - 1 : 0).click();
  await expect(page.getByRole("heading", { level: 2, name: "Aprobación" })).toBeVisible();
}

test("a pending supplier is approved with conditions, and the decision is recorded", async ({ page, isMobile }) => {
  await openSupplier(page, "aprobacion=pending", isMobile);
  await page.getByRole("radio", { name: /Aprobar con condiciones/ }).check();
  await page.getByRole("button", { name: "Guardar decisión" }).click();
  await expect(page.getByText("Este campo es obligatorio.").first()).toBeVisible();

  await page.getByLabel("Condiciones", { exact: true }).fill("Enviar el certificado GFSI vigente.");
  await page.locator("#ap-reviewBy").fill("2026-12-15");
  await page.getByLabel("Motivo", { exact: true }).fill("Falta el certificado del año en curso.");
  await page.getByRole("button", { name: "Guardar decisión" }).click();

  await expect(page.getByText(/Última decisión: Aprobar con condiciones/)).toBeVisible();
  await expect(page.getByText("Enviar el certificado GFSI vigente.").filter({ visible: true }).first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("the suspended supplier shows why, and its nonconformities", async ({ page }) => {
  await openSupplier(page, "aprobacion=suspended", false);
  await expect(
    page
      .getByText(/Tres no conformidades en cinco meses/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "No conformidades" })).toBeVisible();
  // Its three nonconformities in five months trigger the warning.
  await expect(page.getByText(/3 no conformidades en los últimos 12 meses/)).toBeVisible();
});

test("recording a nonconformity adds it to the supplier", async ({ page, isMobile }) => {
  await openSupplier(page, "aprobacion=approved", isMobile);
  await page.getByText("Registrar no conformidad").click();
  const description = `Entrega con sello roto (${isMobile ? "teléfono" : "computadora"}).`;
  await page.getByLabel("Gravedad").selectOption("major");
  await page.getByLabel("Descripción").fill(description);
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(page.getByText(description).filter({ visible: true }).first()).toBeVisible();
});

test("a read-only role sees the approval but can't decide", async ({ page, context, baseURL, isMobile }) => {
  await context.addCookies([{ name: "preview_role", value: "viewer", url: baseURL! }]);
  await openSupplier(page, "aprobacion=approved", isMobile);
  await expect(page.getByText("Tu rol puede ver el estado del suplidor, pero no aprobarlo.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar decisión" })).toHaveCount(0);
  await expect(page.getByText("Registrar no conformidad")).toHaveCount(0);
});

test("the supplier page shows materials by document, and transposed", async ({ page }) => {
  // A company no other test changes, so the matrix is exactly the sample data.
  await page.goto("/jugos-costa-norte/suplidores?orden=materiales&dir=desc");
  await page
    .locator("main :is(tbody tr, ul[aria-label] > li)")
    .filter({ visible: true })
    .first()
    .locator("a[href*='/suplidores/p-']:not([aria-hidden])")
    .click();

  const matrix = page.locator("#matriz");
  await expect(matrix.getByRole("heading", { name: "Documentos por material" })).toBeVisible();
  await expect(matrix.getByRole("columnheader", { name: "Hoja de especificaciones" })).toBeVisible();
  const materials = await matrix.locator("tbody th[scope=row]").count();
  expect(materials).toBeGreaterThan(0);
  await expectNoSeriousA11yIssues(page);

  await matrix.getByRole("link", { name: "Por documento" }).click();
  await expect(page).toHaveURL(/vista=documento/);
  await expect(matrix.getByRole("rowheader", { name: "Hoja de especificaciones" })).toBeVisible();
  // Transposed: one column per material (plus the document and "Falta en" columns).
  await expect(matrix.locator("thead th")).toHaveCount(materials + 2);

  await matrix.getByRole("link", { name: "Solo incompletos" }).click();
  await expect(page).toHaveURL(/vista=documento&incompletos=1/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
