# Engineering docs

How point-barber is built, run and changed (D-PLT-06). Operations — install, deploy, rollback,
backup and secrets — are in [`../ops/`](../ops/README.md).

| Document                                     | What it covers                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`local-setup.md`](local-setup.md)           | A developer machine from nothing: tools, `.env`, hosts file, the Compose stack, host-run development, tests |
| [`coding-guideline.md`](coding-guideline.md) | The rules for code (`CG-*`); delivered, kept as it is                                                       |
| [`module-map.md`](module-map.md)             | The 13 API modules, which API part each owns, and the boundary rules                                        |
| [`db-changes.md`](db-changes.md)             | How the database is built and changed: `db/source/`, migrations, the one migrate entry point                |
| [`../../VERSIONS.md`](../../VERSIONS.md)     | Every pinned tool and image, with the reason                                                                |

## Where the planning sources are

The specs and every planning source live in the sibling repository **point-sdd** (ADR-016). Clone both
side by side (`point/point-sdd`, `point/point-barber`); the links below then work from this folder.

| Source                                                   | Path                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Decision register (`D-*`)                                | [`../../../point-sdd/docs/decisions/`](../../../point-sdd/docs/decisions/)                                                              |
| Database design — DBML, constraint SQL, constraint tests | [`../../../point-sdd/docs/db/`](../../../point-sdd/docs/db/)                                                                            |
| API design — Parts 0–8 and the OpenAPI files             | [`../../../point-sdd/docs/api/`](../../../point-sdd/docs/api/)                                                                          |
| UX guidelines (`AD-*`, `FE-*`)                           | [`../../../point-sdd/docs/ux/`](../../../point-sdd/docs/ux/)                                                                            |
| Architecture decisions (`ADR-*`)                         | [`../../../point-sdd/docs/adr/`](../../../point-sdd/docs/adr/)                                                                          |
| System design                                            | [`../../../point-sdd/docs/architecture/`](../../../point-sdd/docs/architecture/)                                                        |
| Change briefs and plans                                  | [`../../../point-sdd/docs/briefs/`](../../../point-sdd/docs/briefs/) · [`../../../point-sdd/docs/plan/`](../../../point-sdd/docs/plan/) |
| OpenSpec changes and specs                               | [`../../../point-sdd/openspec/`](../../../point-sdd/openspec/)                                                                          |

Nothing from those folders is copied here, with one exception: `db/source/` holds byte-identical
copies of the database files, checked against `db/source/manifest.json` (see `db-changes.md`).

## From change to merge

Every piece of work is an OpenSpec change in point-sdd (`/opsx:propose` … `/opsx:archive`). In
point-barber a change is built as one or more pull requests:

1. **Apply:** `/opsx:apply <change-id>` on a branch `feature/<change-id>/<part>` (CG-GIT-01).
2. **Pull request:** the title is the squash commit, `<type>(<change-id>): <subject>`
   (CG-GIT-02). The template's seven sections are filled in (CG-GIT-04).
3. **CI green and review:** all seven jobs pass, and the other developer reviews. A review by
   Claude Code may come first, but the approval is the other developer's (CG-REVIEW-01).
4. **Test cases:** `/point-generate-tests` in point-sdd produces the test-case workbook for the
   change.
5. **Test:** the workbook is run against the last pull request's Compose stack.
6. **NG fixed on the branch:** each failure is fixed with a commit on that same branch, then
   re-tested.
7. **Squash merge**, only when no NG is open.
8. **Archive:** `/opsx:archive <change-id>` in point-sdd.

When a change is split into several pull requests, the earlier parts merge as they are reviewed.
The last one stays open through steps 4–6.

After each merge, the merged task numbers are ticked in point-sdd's `tasks.md` and committed there.

## Branch protection

The rules for `main` (design D15):

| Setting                 | Value                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| Required status checks  | `static` · `unit` · `pr-title` · `db` · `integration` · `images` · `e2e` |
| Required reviews        | 1 approving review, by someone other than the author                     |
| Merge method            | Squash merge only (no merge commits, no rebase merge)                    |
| Direct pushes to `main` | None                                                                     |

Both repositories must be private (ADR-016 Decision 8). Today both are still public, and making them
private is on the owner's sheet. GitHub enforces protection rules on a private repository only on a
paid plan, which is also an owner item.

**Until the plan allows it, the two developers keep these rules by hand:**

- merge only when all seven jobs are green;
- never approve your own pull request;
- merge only when the other developer's **Approve** shows on GitHub. A comment or a chat message is
  not an approval (CG-REVIEW-01);
- merge only when every conversation is resolved and the branch is up to date with `main`;
- always choose **Squash and merge**;
- never push to `main`.

When the plan is in place, the repository admin turns on the settings above and changes this
paragraph.

## Claude Code hook

After each Edit or Write, Claude Code runs `tools/claude-hooks/after-edit.mjs` on the edited file:
Prettier, then ESLint. The typecheck and the unit tests run before every push instead, in
`.githooks/pre-push` (`pnpm run typecheck`, then `pnpm run test`).

Design D17 sets a 10 s target for the hook. With all four of its steps, the hook took a median of
12.7 s for a single-file edit in `apps/api` (measured for task 7.7), so two of the steps moved to the
push. Both files come with PR-G.
