import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/*
 * Documents, review, requests and the supplier link. Review and requests change the shared
 * in-memory sample data, and desktop and phone run at the same time, so each project takes
 * different rows (desktop from the front of a list, phone from the back).
 */

const COMPANY = "/alimentos-cordillera";

async function expectNoSeriousA11yIssues(page: Page) {
  await expect.poll(() => page.title()).not.toBe("");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // The inside of the browser's own PDF viewer (document previews) isn't ours; the frame itself is checked.
    .exclude('iframe[src$="/archivo"]')
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const rows = (page: Page, caption: string) =>
  page.locator(`main :is(tbody tr, ul[aria-label='${caption}'] > li)`).filter({ visible: true });

/** Document pages in the review queue, in queue order. */
async function queue(page: Page): Promise<string[]> {
  await page.goto(`${COMPANY}/documentos`);
  const list = rows(page, "Documentos");
  const hrefs: string[] = [];
  for (let i = 0; i < (await list.count()); i++) {
    hrefs.push((await list.nth(i).locator("a[href*='/documentos/']").first().getAttribute("href"))!);
  }
  return hrefs;
}

const pick = (list: string[], isMobile: boolean, offset = 0) =>
  isMobile ? list[list.length - 1 - offset] : list[offset];

const PDF = (name = "Documento.pdf") => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"),
});

async function checkEverything(page: Page) {
  const list = page.getByRole("group", { name: "Lista de verificación" });
  // .all() doesn't wait: make sure the review page is there first.
  await expect(list.getByRole("checkbox")).toHaveCount(6);
  for (const box of await list.getByRole("checkbox").all()) await box.check();
}

/* The workspace */

test("the documents page opens on the review queue, by priority", async ({ page }) => {
  await page.goto(`${COMPANY}/documentos`);
  await expect(page.getByRole("link", { name: /Por revisar/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/Primero lo que desbloquea/)).toBeVisible();
  await expect(rows(page, "Documentos").first()).toContainText(/Urgente|Alta|Normal/);
  expect(await noSideScroll(page)).toBe(true);
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("link", { name: /Aceptados/ }).click();
  await expect(page).toHaveURL(/estado=aceptados/, { timeout: 15_000 });
  await expect(page.getByText("Aceptado", { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test("filters live in the URL: expiring accepted documents", async ({ page }) => {
  await page.goto(`${COMPANY}/documentos?estado=aceptados`);
  await page.getByLabel("Vence").selectOption("30");
  await page.getByRole("button", { name: "Aplicar" }).click();
  // The accepted list is long; give it time when many tests run at once.
  await expect(page).toHaveURL(/vence=30/, { timeout: 15_000 });
  await expect(page.getByLabel("Vence")).toHaveValue("30");
  await page.getByRole("link", { name: "Quitar filtros" }).click();
  await expect(page).not.toHaveURL(/vence=/);
});

test("replaced versions are a filter of Accepted, and old links still work", async ({ page }) => {
  // A company no other test changes, so its history is exactly the sample data.
  await page.goto("/jugos-costa-norte/documentos?estado=reemplazados");
  await expect(page.getByRole("link", { name: /Aceptados/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Versiones")).toHaveValue("reemplazados");
  await rows(page, "Documentos").first().locator("a[href*='/documentos/']").first().click();

  await expect(page.getByText("Reemplazado por un documento más reciente.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Historial de este documento" })).toBeVisible();
  await expect(page.getByText("Activa", { exact: true }).filter({ visible: true })).toHaveCount(1);
  await expectNoSeriousA11yIssues(page);
});

test("evidence gaps come from requirements, with a way to request or upload each", async ({ page }) => {
  await page.goto(`${COMPANY}/documentos?vista=faltantes`);
  await expect(page.getByRole("heading", { level: 2, name: "Faltantes de evidencia" })).toBeVisible();
  const first = rows(page, "Faltantes de evidencia").first();
  await expect(first.getByText(/Falta|Vencido|Rechazado|Por revisar/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Solicitar" }).first()).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await expectNoSeriousA11yIssues(page);
});

/* Review */

test("a sample document without a file can't be accepted, only rejected with a reason", async ({ page, isMobile }) => {
  const href = pick(await queue(page), isMobile);
  await page.goto(href);
  await expect(page.getByText(/no tiene archivo/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Aceptar" })).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("button", { name: "Rechazar" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(/Escribe el motivo del rechazo/);
  await page.getByLabel("Motivo del rechazo").fill("Falta el archivo del certificado.");
  await page.getByRole("button", { name: "Rechazar" }).click();
  await expect(page.getByText(/Rechazado por Usuario de ejemplo/)).toBeVisible();
  expect(await queue(page)).not.toContain(href);
});

test("an uploaded document shows what it will change, and needs the checklist to accept", async ({
  page,
  isMobile,
}) => {
  await page.goto(`${COMPANY}/documentos/subir`);
  await page.getByLabel("Suplidor").selectOption({ index: isMobile ? 3 : 2 });
  await page.getByLabel("Tipo de documento").selectOption("questionnaire");
  await page.getByLabel("Fecha de emisión").fill("2026-09-01");
  await page.getByLabel("Archivo").setInputFiles(PDF("Cuestionario 2026.pdf"));
  await page.getByRole("button", { name: "Subir para revisión" }).click();
  await expect(page).toHaveURL(/\/documentos\/up-/);

  // The file comes back as the same PDF, private and never cached, with its fingerprint shown.
  const file = await page.request.get(`${page.url()}/archivo`);
  expect(file.headers()["cache-control"]).toBe("private, no-store");
  await expect(page.getByText("Huella SHA-256")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Qué cambia al aceptarlo" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("button", { name: "Aceptar" }).click();
  await expect(page.getByText("Marca todos los puntos de la lista.")).toBeVisible();

  // Small teams: the person who uploaded it may accept it.
  await checkEverything(page);
  await page.getByRole("button", { name: "Aceptar" }).click();
  await expect(page.getByText(/Aceptado por Usuario de ejemplo/)).toBeVisible();
  await expect(page.getByText("Lista de verificación completa")).toBeVisible();
});

test("upload refuses a file that only pretends to be a PDF, and keeps the form", async ({ page }) => {
  await page.goto(`${COMPANY}/documentos/subir`);
  await page.getByLabel("Suplidor").selectOption({ index: 1 });
  await page.getByLabel("Tipo de documento").selectOption("questionnaire");
  await page.getByLabel("Fecha de emisión").fill("2026-09-01");
  await page
    .getByLabel("Archivo")
    .setInputFiles({ name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
  await page.getByRole("button", { name: "Subir para revisión" }).click();
  await expect(page.getByText(/Solo PDF, JPG o PNG/)).toBeVisible();
  await expect(page.getByLabel("Tipo de documento")).toHaveValue("questionnaire");
});

test("a read-only role sees documents but can't review, upload or send requests", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: "preview_role", value: "viewer", url: baseURL! }]);
  const list = await queue(page);
  await expect(page.getByRole("link", { name: "Subir documento" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Nueva solicitud" })).toHaveCount(0);
  await page.goto(list[Math.floor(list.length / 2)]);
  await expect(page.getByText("Tu rol no puede aceptar ni rechazar documentos.")).toBeVisible();
  await page.goto(`${COMPANY}/solicitudes`);
  await expect(page.getByText("Tu rol no tiene acceso a esta sección")).toBeVisible();
});

test("an unknown document or request shows a friendly page inside the app", async ({ page }) => {
  expect((await page.goto(`${COMPANY}/documentos/no-existe`))?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "No encontramos este documento" })).toBeVisible();
  expect((await page.goto(`${COMPANY}/solicitudes/no-existe`))?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta solicitud" })).toBeVisible();
});

/* Requests and the supplier link */

test("a request goes from a gap to the supplier's phone and back to an accepted document", async ({
  page,
  isMobile,
}) => {
  // A missing guarantee letter: one party-level item with a single document type.
  await page.goto(`${COMPANY}/documentos?vista=faltantes`);
  const gaps = rows(page, "Faltantes de evidencia")
    .filter({ hasText: "Carta de garantía continua" })
    .filter({ hasText: "Falta" })
    .filter({ has: page.getByRole("link", { name: "Solicitar" }) });
  const count = await gaps.count();
  expect(count).toBeGreaterThan(1);
  await gaps
    .nth(isMobile ? count - 1 : 0)
    .getByRole("link", { name: "Solicitar" })
    .click();

  await expect(page.getByRole("heading", { level: 1, name: "Nueva solicitud" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await expect(page.locator('input[name="key"]:checked')).toHaveCount(1);
  await page.getByRole("button", { name: "Enviar solicitud" }).click();

  // The request page shows the link once, to copy or send by WhatsApp.
  await expect(page).toHaveURL(/\/solicitudes\/req-/);
  const requestUrl = page.url().split("#")[0];
  await expect(page.getByText("Enviada", { exact: true }).first()).toBeVisible();
  const link = (await page.getByTestId("request-link").textContent())!.trim();
  expect(link).toMatch(/\/portal\/[A-Za-z0-9_-]{40,}$/);
  await expect(page.getByRole("link", { name: "Abrir en WhatsApp" })).toHaveAttribute("href", /wa\.me/);
  await expect(page.getByText("Solicitud de documentos").first()).toBeVisible();
  expect(page.url()).not.toContain("#enlace");

  // The supplier opens it: only this request, no account.
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: "Documentos solicitados" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(0);
  expect(await noSideScroll(page)).toBe(true);
  await expectNoSeriousA11yIssues(page);
  await page.getByLabel("Archivo o foto").setInputFiles(PDF("Carta de garantía.pdf"));
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Recibido, en revisión")).toBeVisible();

  // The team rejects it with a reason.
  await page.goto(requestUrl);
  await expect(page.getByText("Por revisar", { exact: true }).first()).toBeVisible();
  await page.locator("main a[href*='/documentos/up-']").filter({ visible: true }).first().click();
  await expect(page.getByText("Llegó por una solicitud al suplidor.")).toBeVisible();
  await page.getByLabel("Motivo del rechazo").fill("Falta la firma del representante.");
  await page.getByRole("button", { name: "Rechazar" }).click();
  await expect(page.getByText(/Rechazado por Usuario de ejemplo/)).toBeVisible();

  // The supplier sees why, and sends it again.
  await page.goto(link);
  await expect(page.getByText("Rechazado: envíelo otra vez")).toBeVisible();
  await expect(page.getByText("Motivo: Falta la firma del representante.")).toBeVisible();
  await page.getByLabel("Archivo o foto").setInputFiles(PDF("Carta firmada.pdf"));
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Recibido otra vez, en revisión")).toBeVisible();

  // Accepted with the checklist: the request is complete.
  await page.goto(requestUrl);
  await page.getByRole("link", { name: "Carta_firmada.pdf" }).filter({ visible: true }).first().click();
  await checkEverything(page);
  await page.getByRole("button", { name: "Aceptar" }).click();
  await expect(page.getByText(/Aceptado por Usuario de ejemplo/)).toBeVisible();
  await page.goto(requestUrl);
  await expect(page.getByText("Completa", { exact: true }).first()).toBeVisible();

  // The link now says there's nothing left to send.
  await page.goto(link);
  await expect(page.getByText("No queda nada por enviar. Gracias.")).toBeVisible();
});

test("a made-up request link shows nothing", async ({ page }) => {
  await page.goto("/portal/esto-no-es-un-enlace-valido-de-verdad-1234567890");
  await expect(page.getByRole("heading", { level: 1, name: "Este enlace no está disponible" })).toBeVisible();
  await expect(page.getByText(/Alimentos Cordillera/)).toHaveCount(0);
});

test("the requests page and the email log", async ({ page }) => {
  await page.goto(`${COMPANY}/solicitudes`);
  await expect(page.getByRole("heading", { level: 1, name: "Solicitudes" })).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("link", { name: "Correos enviados" }).click();
  await expect(page.getByText(/no salen de la app/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});
