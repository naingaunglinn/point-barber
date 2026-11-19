# @point/shared

Code that both the API and the web app need and that does no I/O (ADR-001 rule 3 · CG-ARCH-07): Zod
schemas and their inferred types, constants, the three JSON catalogues, and later the money, time and
format helpers.

| Folder                           | Holds                                                                                   | Filled by                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/schemas/`                   | Wire schemas: `problem`, `health`, `system-status`, `list-query`                        | `add-repo-scaffold`; each later change adds its own                                   |
| `src/constants/`                 | `APP_TIME_ZONE`, the error-code catalogue (`validation`, `not_found`, `internal_error`) | `add-repo-scaffold`; status constants (D-DB-03) with the change that first needs them |
| `definitions/permissions.json`   | Permission codes (D-ROLE-08) — `[]`                                                     | `add-foundation-auth-access`                                                          |
| `definitions/settings.json`      | Setting keys, types, defaults (D-PLT-16) — `[]`                                         | `add-settings-store`                                                                  |
| `definitions/notifications.json` | Notification catalogue — `[]`                                                           | the first change that sends a notification                                            |

Run: `pnpm --filter @point/shared build` (to `dist/`) · `pnpm --filter @point/shared typecheck`.
Inside the monorepo the API and the tests read `src/` directly through the `source` export condition.
