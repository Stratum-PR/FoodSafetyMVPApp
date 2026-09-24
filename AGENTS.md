# Stratum FSQMS · agent rules

Rules for every coding agent working in this repo (Claude Code reads this through `CLAUDE.md`;
Codex reads it directly). The product is a bilingual (Spanish-first) food-safety SaaS: supplier and
document management for food manufacturers and distributors in Puerto Rico, built toward FSMA
and SQF compliance.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working rules

- **Never push, open a pull request, merge or deploy unless the user explicitly says so in that
  message.** Commit locally on a branch, show the changes, and wait. Approval for one change doesn't
  carry over to the next.
- Work on a branch (`feat/…`, `fix/…`, `chore/…`); `main` is protected and only the user merges.
- Commit as the repo-local git user and end commit messages with a `Co-Authored-By` line.
- **No secrets** in code, config or commits (keys, passwords, connection strings). Production secrets
  live in Azure Key Vault; local overrides go in `.env.local` (git-ignored). `.env.example` documents
  variable names only.
- **No real customer or supplier data anywhere in the repo**, including tests, seeds and screenshots.
  Sample data is fictional (see `src/server/sample/`). Don't use real company names.
- Keep changes small and focused; explain what changed and how you verified it.

## Stack (versions matter)

- Next.js 16 App Router, React 19, TypeScript strict, pnpm. Read `node_modules/next/dist/docs/` before
  using an API you haven't checked: request APIs (`params`, `cookies()`, `headers()`) are async,
  `middleware` is now `proxy`, `next lint` is gone (use `pnpm lint`).
- Tailwind CSS v4 (tokens in `src/app/globals.css`) and shadcn/ui **base-nova** style, which is built
  on **Base UI**, not Radix: compose with the `render` prop (e.g.
  `<DropdownMenuTrigger render={<Button />}>`), not `asChild`. Add components with
  `npx shadcn@latest add <name>`; don't hand-edit `src/components/ui/*` beyond fixes.
- next-intl with the language from a cookie or the browser, **never in the URL** (`src/i18n/`).
- Vitest (unit), Playwright + axe (browser, desktop and phone), ESLint + Prettier.
- Output is `standalone` for a Docker image on Azure Container Apps; `pnpm start` runs it that way.

## Structure

| Path               | What goes there                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/`         | Routes. Company pages live under `src/app/(app)/[company]/`, with Spanish URL segments (`/suplidores`, `/documentos`…).                                                                                                  |
| `src/components/`  | Shared UI. `ui/` is generated shadcn; `app-shell/` is the frame.                                                                                                                                                         |
| `src/domain/`      | **Pure TypeScript business rules** (requirements, statuses, compliance %, permissions). No imports from Next, React, UI or server code (enforced by ESLint). Every rule has unit tests.                                  |
| `src/server/`      | Services the screens call (`import "server-only"`). Today they return fictional sample data; later they query Postgres with the user's company and role (row-level security). **Screens never read data any other way.** |
| `src/i18n/`        | Language config and checks.                                                                                                                                                                                              |
| `messages/es.json` | Spanish text, the source. `messages/en.json` must match it key for key.                                                                                                                                                  |
| `e2e/`             | Playwright tests.                                                                                                                                                                                                        |
| `scripts/`         | Repo scripts (i18n check, standalone server).                                                                                                                                                                            |

## Product rules

- **Spanish first, every screen in English.** No hardcoded user-facing text: add keys to both
  `messages/es.json` and `messages/en.json`. Use Puerto Rico terms: "suplidor", "Vigente / Por vencer /
  Falta". `pnpm i18n:check` fails on any gap or placeholder mismatch.
- **Every company's data is separate.** Pages take the company from the URL and pass it to services;
  never query across companies.
- **Desktop and phone both fully work.** Use `ResponsiveTable` (cards on phones), test at both sizes.
- **Accessibility target: WCAG 2.1 AA.** Labels on every control, `aria-hidden` on decorative icons,
  status shown by text and icon, not color alone (`StatusPill`).
- **Colors come from tokens** (`bg-primary`, `text-muted-foreground`, `bg-status-current-bg`…), never raw hex.
- **Errors:** expected problems get a clear translated message. Unexpected ones hit the error boundary,
  which shows a reference code (the error digest). Never show stack traces or database messages.
- Mark fictional data with `SampleDataBadge` while `usingSampleData` is true.

## Tests and checks

- Every feature or bug-fix change includes tests. Business rules in `src/domain/` get unit tests; new
  user flows get a Playwright test (it runs at desktop and phone size, with an accessibility scan).
- While working, run only the tests related to your change; CI runs everything.
- Before proposing a commit, run `pnpm check` (lint, types, i18n, unit tests). Run `pnpm build` and
  `pnpm test:e2e` when routes or layouts change.

| Command                        | Does                                        |
| ------------------------------ | ------------------------------------------- |
| `pnpm dev`                     | Local dev server                            |
| `pnpm check`                   | Lint, typecheck, i18n check, unit tests     |
| `pnpm build` then `pnpm start` | Production build, served like the container |
| `pnpm test:e2e`                | Browser tests against the production build  |
| `pnpm format`                  | Prettier                                    |

## Definition of done

1. Works in Spanish and English, on desktop and phone.
2. Uses the service layer for data and design tokens for styling.
3. Tests added or updated; `pnpm check` passes (and e2e when UI changed).
4. No secrets, no real customer data, no hardcoded UI text.
5. Committed on a branch with a clear message, **not pushed** until the user says so.
