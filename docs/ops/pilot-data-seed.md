# Pilot data seed

## Purpose

Load the pilot branch's real data into the pilot database before the screens that create it exist:
the branch, its people with their roles, the services with durations and prices, who may perform
what, and the KBZPay reference pattern (add-pilot-data-seed · owner answer S16).

## When

- Once before the pilot starts, after the first company admin exists, and **at least one day before the pilot's
  first day**. The barbers' branch assignments start on the run date, so a paper slip from an earlier day cannot be
  entered as a late entry: START answers `not_assigned_to_branch`.
- Again during the pilot when a barber or a service is added (step 7).

It refuses as soon as the database holds a second branch, so it can never touch a multi-branch
database. It is deleted when the real screens and the import arrive.

## Before you start

- A release with `add-walkin-visit-checkout` and `add-pilot-data-seed` is deployed (`deploy.md`), and
  the base seed job has **finished**, not only started: `dc logs api | grep -c 'sync.code_tables step done'`
  prints `3`. Before that the payment methods and roles may still be missing, and the command refuses.
- The first company admin exists (`install.md` step 9). The command never creates an admin.
- **The owner's values**, given to the operator directly, never in GitHub, an issue, a pull request
  or a saved chat:
  - the branch: code, names, address and phone. The phone is optional in the file, but the example file has none,
    and a branch without one prints no phone on its receipts, so ask the owner for it;
  - each person: Google address, names, employee code, and Barber or Manager;
  - the services: names, minutes and prices, plus any barber price;
  - the KBZPay pattern with two real sample references.
- The format is `db/pilot/pilot-data.example.json`, which holds invented example values only.

## Steps

All as `deploy` in `/opt/point`, with
`alias dc='docker compose -f docker-compose.yml -f docker-compose.staging.yml'`.

1. Write the owner's values into a file **outside the checkout**, readable by you only:
   ```sh
   install -m 600 /dev/null ~/pilot-data.json && nano ~/pilot-data.json
   ```
   The file never enters the image, the container or a repository: the command reads it from standard
   input, and there is no `--file` option.
2. **Dry run** (writes nothing; it runs the whole write and rolls it back, so it proves the apply
   would succeed):
   ```sh
   dc exec -T api node dist/cli/pilot-seed.js < ~/pilot-data.json
   ```
   It prints one line per table: `<table>: create <n>, unchanged <m>`, and `, update <k>` on a table where a
   stored value changes (the KBZPay pattern).
3. **Send the owner a summary and wait for the OK (PD5):** the branch, each person with their role,
   and each service with its price. No addresses go in a saved chat.
4. **Apply**, before the shop opens:
   ```sh
   dc exec -T api node dist/cli/pilot-seed.js --apply < ~/pilot-data.json
   ```
   It prints `applied on <date> — request_id <id>`, then the plan.
5. **Check:** run the dry run once more. Every table must show `create 0`, and no table an `update` other than 0.
6. Each barber signs in with Google in the phone's browser. No invitation e-mail is sent.
7. **A new barber or service during the pilot:** add it to the file, then repeat steps 2–5. Only what
   is new is written.
8. **When the pilot ends,** delete the file: `shred -u ~/pilot-data.json`.

## Check

- The second dry run shows `create 0`, and `update 0` where the column appears, in every table.
- The first barber's sign-in reaches the start page, with the pilot branch.
- Record in the pilot sheet: the run's `request_id` and the row counts. No names.

## If it fails

Exit status 1 means **nothing was written**: the whole run is one transaction. Standard error says
why, one line per problem.

| After `pilot-seed: `                                  | Meaning                                                                                                              | What to do                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| a JSON path, e.g. `people[1].email: …`                | The file breaks a rule: format, duplicate, unknown key, a `.test` address, a sample that does not match the pattern. | Fix the file.                                                                                       |
| `users: the database holds .test addresses`           | The database was filled by the development fixture. It is not the pilot database.                                    | Stop. Check which server you are on.                                                                |
| `companies: …` · `roles: …` · `payment_methods: no …` | The API never started on this build, or the seed roles are older than the walk-in slice.                             | Start the API once on the current release, then rerun. If a role lacks a code, tell the developers. |
| `branches: the company holds …`                       | Another branch exists. The command serves one pilot branch only.                                                     | Stop. The real screens or the import handle more branches.                                          |
| `people[n]: … belongs to an existing …`               | An address or a code belongs to someone else.                                                                        | Check the file against the people already loaded.                                                   |
| `<table> <key> <column>: stored …, file …`            | A stored value differs from the file. The command never changes a stored value (PD3).                                | Put the stored value back into the file. A real change waits for the screens.                       |
| `failed — nothing was written (…)`                    | An unexpected error.                                                                                                 | Send the line to the developers.                                                                    |
