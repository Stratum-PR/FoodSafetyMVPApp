# Local feature integration

Integration branch: `feat/integrate-all-features`.
Base: GitHub `main` at `0cea531`.

## Preserved work

| Source                                        | Treatment                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feat/suppliers` (`148777c`)                  | Already included in the base: sites, qualifications, obligations, risk, certification, FSMA 204 and supplier screens.                                                                 |
| `feat/documents-requests` (`937445f`)         | Already included in the base: document workspace and review, requests, portal, email log and reminders.                                                                               |
| `feat/supplier-qualification` (`0cc1157`)     | Already included in the base; no unique commits.                                                                                                                                      |
| `feat/preserved-panel-operations` (`224e769`) | Integrated operational dashboard cards and active-supplier navigation.                                                                                                                |
| `feat/preserved-suppliers-list` (`a03295e`)   | Merged summary cards, filter menu/chips, search, pagination, clickable rows and supplier creation. Includes the panel commit.                                                         |
| `chore/preserve-local-documents` (`86d69e1`)  | Backup of all original uncommitted work. Domain differences were older model versions or formatting; retained the newer base implementation. Restored the local launch configuration. |

## Reconciliation

- Dashboard calculations use current obligations, commercial source status, approval terms and facility records. Waived and inapplicable obligations do not become gaps.
- The toolbar retains risk and expiry filters alongside the added lifecycle filters. Approval options use the current derived approval states.
- Supplier creation also creates its initial site and retains company isolation and service-level permissions.
- Clickable rows preserve separate links to materials, documents and nonconformities.
- Wide tables scroll inside their container and support keyboard focus.
- Spanish and English text remain paired.

`FSQMS_Site` is a separate landing-page repository and is not part of this merge.
The two other app worktrees are unchanged. No branch was pushed, and local `main` was not advanced.

## Validation

Run `pnpm check`, `pnpm build` and `pnpm test:e2e --workers=2`.
Integration regressions are covered in `src/server/supplier-integration.test.ts`,
`src/domain/operations.test.ts` and `e2e/integration.spec.ts`, alongside the existing flows.
