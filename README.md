# Stratum FSQMS

The Stratum food-safety quality system: supplier and document management for food manufacturers
and distributors, Spanish first with every screen in English. Private repository.

The public marketing site lives in `Stratum-PR/FoodSafetyLandingPage`. Rules for coding agents (and
a good overview for people) are in [`AGENTS.md`](AGENTS.md).

## Status

**Week 1 foundation.** The app frame, design system, languages, tests and CI are in place, running on
fictional sample data. There's no database, sign-in or deployment yet; the real screens come next.

## Run it

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The component review page is at `/dev/ui`.

| Command         | Does                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| `pnpm check`    | Lint, typecheck, Spanish/English check, unit tests                               |
| `pnpm build`    | Production build (standalone output for the Docker image)                        |
| `pnpm start`    | Serves the production build the way the container will                           |
| `pnpm test:e2e` | Browser tests at desktop and phone size, with accessibility checks (build first) |
| `pnpm format`   | Format with Prettier                                                             |

## Structure

```
src/app/(app)/[company]/   company pages: panel, suplidores, documentos, solicitudes, historial, ajustes
src/app/dev/ui/            component review page
src/components/            shared UI (ui/ = generated shadcn, app-shell/ = the frame)
src/domain/                business rules, framework-free, unit-tested
src/server/                services the screens call (sample data today, Postgres later)
src/i18n/                  language config and checks
messages/                  es.json (source) and en.json
e2e/                       Playwright tests
```
