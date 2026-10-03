# Point Barbershop — Coding Guideline

> **File:** `docs/engineering/coding-guideline.md` (repo `point-barber`) · **Version:** **v1.0 — 🔒 APPROVED by the owner (02/Oct/2026 13:46 — REC-42 ✅, D-ENG-02)** · **Date:** 02/Oct/2026
> **Status:** 🔒 **Approved — every rule of this file is binding, the ⚠️ ones included** (owner 02/Oct/2026 13:46: "Ok ပါတယ်" — REC-42 ✅). ⚠️ now only marks where a rule comes from (this guideline's own recommendation rather than an earlier locked source). A change = a new version + a register note. Still open are the team items of §26 (OPEN-CG-02..06 — tool pins, coverage floors, how CI reads `point-sdd`, libraries, the GitHub plan); they do not block the first changes. v1.0 = the draft with the fixes of the independent review of 02/Oct/2026 (§27). Already locked and marked 🔒 below: 🔒 **D-ENG-02** — this file, its rule IDs and its references (§1); 🔒 **D-ENG-01** — the enforcement model (machine-checkable = CI fails; the rest = PR review checklist), the tooling (pnpm workspaces + Turborepo, Node 24 LTS, TypeScript strict, ESLint + Prettier, Vitest, integration tests on a real PostgreSQL 16, Playwright, GitHub Actions, short-lived branches + PR with 1 review + squash merge, Conventional Commits with the change id as scope), the component catalogue = a `/dev/ui` page, and test-environment login by e-mail OTP read from Mailpit (owner, 02/Oct/2026 — decision sheet D1–D4).
> **Companion files (repo `point-sdd`, cloned beside this repo as `../point-sdd`):** `docs/decisions/decision-register.md` (🔒 decisions) · `docs/db/` · `docs/ux/admin-panel.md` (`AD-…`) · `docs/ux/frontend-website.md` (`FE-…`) · `docs/api/00-conventions.md` (`API-…`) and `docs/api/01..08-*.md` · `docs/adr/` · `docs/architecture/system-design.md` · `openspec/config.yaml`.
> **What this file adds:** how the code is written, tested, reviewed and merged. It never adds, widens or narrows a business rule — those live in the sources above.

---

## မြန်မာ အတိုချုပ် (Owner အတွက်)

- ဒီဖိုင်က **code ရေးတဲ့ စည်းမျဉ်းစာအုပ်** ပါ။ UI/UX guideline ကို Laws of UX ကိုးကားပြီး ရေးခဲ့သလို၊ ဒီဖိုင်ကို ကမ္ဘာသုံး စံတွေ (Google TypeScript Style Guide · Clean Code / SOLID · Twelve-Factor App · OWASP ASVS · NestJS / Next.js / Prisma official documentation · Conventional Commits · test pyramid) ကိုးကားပြီး ရေးထားတယ် (§1)။
- Developer ၂ ယောက်နဲ့ Claude Code က code ရေးတိုင်း ဒီစည်းမျဉ်းကို လိုက်နာရမယ်။ PR တိုင်းမှာ စည်းမျဉ်းနံပါတ် (`CG-…`) ကို ဆုံးဖြတ်ချက်နံပါတ် (`D-…`) နဲ့အတူ ရေးရမယ်။
- **ငွေကို ကာကွယ်တဲ့ စည်းမျဉ်း:** ငွေ = ကျပ် ကိန်းပြည့်ပဲ (ဒသမ လုံးဝမသုံး) · စုစုပေါင်းကို server ကပဲ တွက် · ခလုတ် ၂ ခါ နှိပ်မိလည်း စာရင်း ၂ ခါ မဝင် · ပြီးသွားတဲ့ အရောင်း / စာရင်းပိတ်ကို မပြင်ရ — ပြင်စရာရှိရင် အကြောင်းပြချက်နဲ့ စာရင်းအသစ်။
- **Data ကို ကာကွယ်တဲ့ စည်းမျဉ်း:** ခွင့်ပြုချက် (permission + ဆိုင်ခွဲ) ကို server က စစ် · ငွေစာရင်းကို မဖျက်ရ · လျှို့ဝှက် key၊ customer ဖုန်းနံပါတ်၊ လစာကို code / log / screenshot ထဲ မထည့်ရ · စမ်းသပ် data ထဲ ဆိုင်ရဲ့ တကယ့် data မသုံးရ။
- **အချိန်:** ရက်စွဲနဲ့ လုပ်ငန်းနေ့ကို မြန်မာစံတော်ချိန်နဲ့ server က တွက်တယ် — ဖုန်းရဲ့ နာရီကို မယုံဘူး။
- **စစ်ဆေးပုံ (owner အတည်ပြုပြီး — 02/Oct):** စက်က စစ်လို့ရတာ အကုန် CI က အလိုအလျောက် စစ်တယ်၊ မအောင်ရင် merge မရ (ဥပမာ ငွေကို ဒသမနဲ့ တွက်တာ၊ screen စာသားကို code ထဲ တိုက်ရိုက်ရေးတာ၊ အရောင် code တိုက်ရိုက်ရေးတာ)။ စက်က မစစ်နိုင်တာကို PR review checklist နဲ့ လူက စစ်တယ်။
- **Test:** ငွေ၊ permission၊ ရက်စွဲ စည်းမျဉ်းတွေအတွက် test အရင်ရေး၊ ပြီးမှ code ရေး။ Spec ထဲက scenario တစ်ခုစီမှာ test အနည်းဆုံး တစ်ခု ရှိရမယ်။
- **Claude Code:** spec မှာ မပါတာကို ကိုယ်တိုင် မတီထွင်ရ — ရပ်ပြီး မေးရမယ်။ Rule၊ အရောင်၊ စာသား အသစ် မဖန်တီးရ။ Claude ရေးတဲ့ code ကို developer က တစ်ကြောင်းချင်း ဖတ်ပြီးမှ PR တင်ရမယ်။
- **အခြေအနေ:** **v1.0 — owner approve ပြီး (02/Oct/2026 13:46 — REC-42 ✅)**။ ဒီဖိုင်ထဲက rule အကုန် (⚠️ ပါ) binding ဖြစ်ပြီ; ပြောင်းချင်ရင် version အသစ် + register note။ ကျန်တာ = §26 ထဲက team ရွေးရမယ့် ၅ ချက် (tool version pin · coverage floor · CI က point-sdd ဖတ်ပုံ · library · GitHub plan) — ပထမ change တွေကို မတားဘူး။
- **Owner လုပ်ရန်:** ဖတ်ပြီး မကြိုက်တဲ့ rule ကို မဖျက်ဘဲ ✖ နဲ့ အကြောင်းပြချက် ရေးပေးပါ။ ကျန်တာ လက်ခံရင် "OK" ပေးရုံပါ။ ဆုံးဖြတ်ဖို့ / စစ်ဖို့ ကျန်တာ ၆ ခုကို §26 မှာ စာရင်းလုပ်ထားတယ်။
- နေ့စဉ် အသုံးအများဆုံး rule ၁၂ ခုကို အောက်မှာ အရင် ပြထားတယ်။

---

## Top 12 rules — the daily list

| # | Rule | IDs |
| --- | --- | --- |
| 1 | **Spec before code.** No branch without an OpenSpec change. If the code needs behaviour the spec does not state, stop and fix the spec in `point-sdd` first | CG-META-03 · CG-META-04 |
| 2 | **Money is an integer number of kyats** — `bigint` (`Mmk`) in code, JSON integer on the wire, no float, no arithmetic outside the money module, totals computed by the server | CG-MONEY-01 · CG-MONEY-03 · CG-MONEY-06 |
| 3 | **Every endpoint declares exactly one access decorator**; permission AND scope are checked on the server; the UI only mirrors | CG-API-02 · CG-SEC-02 |
| 4 | **A money row can never be created twice** — `Idempotency-Key` on row-creating money endpoints, state checks on actions, one key per logical submit on the client | CG-IDEM-01 · CG-IDEM-03 · CG-IDEM-04 |
| 5 | **Locks first, in the one order; every check after the locks; READ COMMITTED** for anything that writes money, stock or pay data | CG-DB-06 · CG-DB-07 |
| 6 | **Finished records are immutable and transactional rows are never hard-deleted** — a correction is a new row with a reason | CG-DB-11 |
| 7 | **The server computes `business_date` in Asia/Yangon** and reads time only from the injected clock — never `new Date()` scattered in code | CG-TIME-02 · CG-TIME-03 |
| 8 | **A module writes only its own tables; Next.js never writes** — the API is the only writer | CG-ARCH-02 · CG-ARCH-06 |
| 9 | **No raw UI string, no hex colour, no raw status number** — language keys, tokens and named constants only | CG-I18N-01 · CG-UI-05 · CG-TS-04 |
| 10 | **Tests first for money, permission and date-boundary rules**; integration tests run against a real PostgreSQL 16 | CG-TEST-03 · CG-TEST-04 |
| 11 | **Never swallow an error; never log a secret, a token, a phone number or a salary** | CG-ERR-01 · CG-OBS-03 |
| 12 | **Small PR, one change, IDs cited, CI green, one human review, squash merge** | CG-GIT-01..05 · CG-REVIEW-01 |

---

## 0. How to use this document (developers and Claude Code)

**CG-META-01 · Precedence.** 🔒 D-PLT-13 · API-META-01 · `openspec/config.yaml`\
When sources disagree, this order wins: (1) 🔒 decisions in the decision register → (2) `docs/db/` → (3) the UX guidelines (`AD-…`, `FE-…`) → (4) the API conventions and part files (`API-…`, `Pn-RULE-nn`) → (5) ADRs and the system design → (6) this guideline. A rule here that contradicts any of them loses: **stop, describe both sides, ask the owner** — never pick a side in code.\
*Why:* a silently chosen side in a money or permission rule becomes a wrong receipt or a leak that nobody decided.\
*Enforced by:* Review.

**CG-META-02 · Rule IDs, tags and enforcement labels.** 🔒 D-PLT-17 · D-ENG-01 · D-ENG-02\
Every rule has an ID `CG-<AREA>-nn`; PRs, commits and OpenSpec tasks cite it next to decision, API and UX IDs (`Implements D-VIS-07 · P4.SAL.10 · AD-POS-12 · CG-IDEM-03`). Tags: **🔒** = the rule implements a locked decision, ADR or API rule (cited) — implement exactly; **⚠️** = this guideline's own rule — binding once the owner approves v1.0. Every rule ends with *Enforced by:* **CI** (the tool or lint rule is named — the build fails), **Review** (the reviewer's checklist, §17) or **Both**. A rule printed as `→ see CG-…` is a pointer: its ID stays valid for citation, its text lives in the rule it points to.\
*Why:* an ID lets a reviewer say "CG-DB-07" instead of re-arguing the rule in every PR.\
*Enforced by:* Review — PR template (CG-GIT-04).

**CG-META-03 · Spec before code.** 🔒 D-PLT-17 · D-PLT-20 · D-PLT-13\
Code is written only for an OpenSpec change that exists in `../point-sdd/openspec/changes/<change-id>/` and whose proposal has nothing left under *Open questions → Needs the owner's answer* (recorded readings do not block). A change with an unanswered question is not applied at all — not even the task groups that seem not to depend on it. One change = one form or topic, 1–3 days. A Claude Code session implements one change: it starts by reading `CLAUDE.md`, the Top 12 of this file and the change's proposal, specs, design and tasks, and does the tasks in their order, ticking each when its tests pass. A bug fix that changes specified behaviour needs a `fix-…` change; a bug fix that restores specified behaviour needs only a failing test.\
*Why:* two developers and an AI agent stay consistent only if the spec, not the chat, is the instruction — and an agent with two changes in its context mixes their rules.\
*Enforced by:* Both — CI: job `pr-title` (the title carries a change id) · `spec:trace` (that change exists in `point-sdd`); Review.

**CG-META-04 · Silence or conflict = stop.** 🔒 D-PLT-13 · D-PLT-11\
If the spec is silent, or two locked sources disagree, the work on that point stops: write the question with both readings in the change's `Open questions` in `point-sdd`, tell the owner; the change is not applied further until the owner answers (CG-META-03) — work continues on another change. Never ship a guessed default — no "reasonable default", no "I assumed", from a developer or from Claude Code — and never treat a ⚠️ recommendation or a design-reference image as a requirement.\
*Why:* a guessed default for "who may reopen a day" looks like working software until the first month-end, and an agent's assumption reads exactly like a decision once it is code.\
*Enforced by:* Review.

**CG-META-05 · Two repositories; exceptions are written down.** 🔒 ADR-016 · D-ARC-03 + ⚠️\
`point-sdd` holds specs and planning sources; `point-barber` holds code, migrations, tests and this file. `/opsx:apply` runs inside `point-barber` on `feature/<change-id>`; brief, explore, propose, validate, test-case generation and archive run inside `point-sdd`. Planning text is not copied into `point-barber` — code links to a source by ID; the one exception is `db/source/`, byte-identical copies of the database files checked by hash (CG-DB-01). A deliberate deviation from a ⚠️ rule carries a comment `// cg-exception CG-XXX-nn: <reason>` at the place and one line in the PR description; a deviation from a 🔒 rule is not available to a developer (CG-META-01).\
*Why:* an exception nobody can find becomes the new convention.\
*Enforced by:* Both — CI: `eslint-comments/require-description` (a disable without a reason fails); Review.

> **About the examples.** Code samples are TypeScript for NestJS, Prisma ORM 7, Next.js 16 (App Router), Zod 4, React Hook Form and TanStack Query v5. Helper names follow the designs of the first four changes where those already name them (`TransactionRunner.run`, `ProblemException`, `@ZBody`, `@Idempotent`, `Idempotency.run`, `@Audited` with `Audit.emit` / `Audit.skip`, `moneyFromWire` / `moneyToWire`, `businessDateOf`, `ClockProvider` / `useNow()`, `pnpm guards`, `pnpm i18n:check`); the other names (`moneyFromDb`, `percentOfMoney`, `useIdempotentMutation`, `openapi:check`, `spec:trace` …) are proposals — the change that builds them fixes the real name, and that name wins. Decorators, lock helpers, codes and paths quoted from the API design (`@Can(…)`, `DayLock`, `PayrollLock`, `StockLedger.post`, error codes) are not illustrative — they are the contract.

---

## 1. References → rules

**🔒 D-ENG-02.** These are the references this rulebook is derived from. Where a reference and a locked rule disagree, the locked rule wins and §25 lists the place.

| Reference | URL (checked 02/Oct/2026) |
| --- | --- |
| Google TypeScript Style Guide | <https://google.github.io/styleguide/tsguide.html> |
| Clean Code (Robert C. Martin, 2008) · SOLID principles | <https://en.wikipedia.org/wiki/SOLID> |
| A Philosophy of Software Design (John Ousterhout) — "deep modules" *(added reference for CG-PRIN-04)* | <https://web.stanford.edu/~ouster/cgi-bin/aposd.php> |
| The Twelve-Factor App | <https://12factor.net/> |
| OWASP ASVS — **5.0.0** (May 2025, 17 chapters) | <https://owasp.org/www-project-application-security-verification-standard/> · <https://github.com/OWASP/ASVS/tree/v5.0.0> |
| OWASP Top 10 — **2025** · OWASP Cheat Sheet Series (the practical form of ASVS) | <https://owasp.org/Top10/> · <https://cheatsheetseries.owasp.org/> |
| NestJS documentation | <https://docs.nestjs.com/> |
| Next.js documentation (App Router, 16.x) | <https://nextjs.org/docs> |
| Prisma ORM documentation (7.x — see OPEN-CG-02) | <https://www.prisma.io/docs/orm/v7> |
| PostgreSQL 16 documentation — Transaction Isolation · Explicit Locking *(added for CG-DB-06..08)* | <https://www.postgresql.org/docs/16/transaction-iso.html> · <https://www.postgresql.org/docs/16/explicit-locking.html> |
| Conventional Commits 1.0.0 | <https://www.conventionalcommits.org/en/v1.0.0/> |
| The Practical Test Pyramid (Ham Vocke, martinfowler.com) | <https://martinfowler.com/articles/practical-test-pyramid.html> |
| RFC 9457 — Problem Details for HTTP APIs *(added — API-ERR-01)* | <https://www.rfc-editor.org/rfc/rfc9457> |
| WCAG 2.1 (level AA — through the UX guidelines) *(added — AD-A11Y-01, FE-A11Y-01)* | <https://www.w3.org/TR/WCAG21/> |
| TanStack Query v5 · Zod documentation *(added — library usage rules)* | <https://tanstack.com/query/latest> · <https://zod.dev/> |

**Mapping — reference principle → what it means for this system → rules.** One line per principle, in our own words.

| # | Reference | Principle | What it means for Point | Rules |
| --- | --- | --- | --- | --- |
| 1 | Google TS | Prefer `unknown` over `any` | Everything that crosses a boundary (HTTP body, job data, socket payload, env, raw SQL row) is `unknown` until a Zod schema has parsed it | CG-TS-02 · CG-API-03 |
| 2 | Google TS | Assertions (`x!`, `x as T`) need a stated reason; prefer a runtime check | A wrong assertion on a sale row is a runtime crash at checkout — narrow instead | CG-TS-03 |
| 3 | Google TS | `const` by default, `let` when reassigned, never `var` | Plus `readonly` data: a DTO is not mutated after it is built | CG-TS-06 |
| 4 | Google TS | Every `switch` has a `default` | The `default` of a status switch calls `assertNever`, so a new status code is a compile error everywhere | CG-TS-05 |
| 5 | Google TS | `===` / `!==` only | Plus explicit comparisons: `0` is a valid amount, so `if (amount)` is a bug | CG-TS-08 |
| 6 | Google TS | Named exports, no default exports | Same, except the files where Next.js requires a default export | CG-NAME-03 |
| 7 | Google TS | Throw only `Error` (sub)classes; `catch` gives `unknown`; no empty `catch` | Business failures are typed problem errors; nothing is swallowed | CG-ERR-01 · CG-ERR-03 |
| 8 | Google TS | Use plain `enum` (not `const enum`) | **Overridden** — status values are smallint codes with named constants (🔒 D-DB-03): `as const` objects, no TypeScript `enum` | CG-TS-04 · §25 |
| 9 | Google TS | `lowerCamelCase` for properties | **Overridden for data fields** — DB columns, DTO fields and form fields keep one snake_case name end to end (API-SHAPE-03) | CG-NAME-02 · §25 |
| 10 | Google TS | No `@ts-ignore`; suppressions are explained | A suppression without a reason fails CI | CG-TS-01 · CG-META-05 |
| 11 | Clean Code | Meaningful names; one word per concept | The words are the glossary's and the DB's: booking ≠ visit ≠ sale ≠ payment; `performer`; no `barber` or vendor name in a table, column or data-field name | CG-NAME-01 |
| 12 | Clean Code | Functions do one thing; comments explain intent | A controller parses and delegates; a rule function is pure; a comment says *why* and cites the ID | CG-API-01 · CG-TEST-02 · CG-DOC-03 |
| 13 | Clean Code | Leave the code cleaner than you found it | **Limited** — clean-ups go in their own PR, never inside a change's diff | CG-AI-07 · §25 |
| 14 | SOLID — S | One reason to change | One NestJS module per bounded context; one owner per table | CG-ARCH-01 · CG-ARCH-02 |
| 15 | SOLID — I / D | Small interfaces; depend on abstractions | Interfaces only at real seams (storage, mail, renderer, jobs, clock, realtime) — not on every service | CG-ARCH-08 |
| 16 | Ousterhout | Deep modules: a small interface hiding a lot | `DayLock.assertOpen`, `StockLedger.post`, `Commission.estimate` — callers never see the tables behind them | CG-PRIN-04 · CG-ARCH-01 |
| 17 | 12-Factor I · II | One codebase; dependencies declared and isolated | One app repo with a lockfile and pinned majors; specs live in the other repo | CG-DEP-03 · CG-DOC-04 |
| 18 | 12-Factor III | Config in the environment | Secrets only in the server `.env`, validated at boot; business-tunable values are *settings*, not env | CG-SEC-05 · CG-ARCH-09 |
| 19 | 12-Factor IV · VI · IX | Backing services attached; stateless, disposable processes | PostgreSQL, the bucket and mail sit behind seams; a restart loses no business state — jobs are in pg-boss, timers are never in memory | CG-ARCH-05 · CG-ARCH-08 · CG-ARCH-09 |
| 20 | 12-Factor V · XII | Build, release, run are separate; admin tasks run as one-off processes from the same code | Migrations run at release (`prisma migrate deploy`), never by hand; restore and seed scripts live in the repo | CG-DB-01 · CG-DOC-02 |
| 21 | 12-Factor X | Dev / prod parity | Integration tests use PostgreSQL 16, the real migrations and an S3-compatible store; Caddy routes locally as in production | CG-TEST-04 |
| 22 | 12-Factor XI | Logs are an event stream | Structured JSON to stdout; no log files, no `console.log` | CG-OBS-01 |
| 23 | ASVS V1 · V2 | Encode output, sanitise input; validate at a trusted layer; protect business logic | Zod at every boundary; parameterised SQL; escaped templates; CSV formula guard; limits and state machines on the server | CG-API-03 · CG-SEC-04 · CG-API-07 |
| 24 | ASVS V3 · V4 · V12 | Browser-side protections; safe API surface; encrypted transport | Session cookie + CSRF header + Origin check, no CORS, HTTPS and headers at Caddy, three API surfaces kept apart | CG-SEC-01 · CG-SEC-12 |
| 25 | ASVS V5 | Files are checked by content and stored safely | Magic-byte check, re-encode, EXIF removal, staging → link, private bucket | CG-SEC-08 |
| 26 | ASVS V6 · V7 · V10 | Authentication, session management, OIDC | Passwordless (Google OIDC / e-mail OTP), opaque server-side sessions with instant revoke — as ADR-005 | CG-SEC-01 |
| 27 | ASVS V8 | Authorisation is enforced on the server for every request and every object | Permission AND data-level scope through one decorator; out-of-scope reads answer 404; a deny-path test per code | CG-SEC-02 · CG-API-02 · CG-TEST-05 |
| 28 | ASVS V9 | Self-contained tokens (JWT) are validated strictly | **Not used for sessions** — 🔒 ADR-005 chose opaque sessions; a JWT library appears only where Google's ID token is verified | CG-SEC-01 · §25 |
| 29 | ASVS V11 · V13 · V14 | Strong randomness and hashing; safe configuration; sensitive data protected and minimised | CSPRNG tokens stored as hashes; secrets validated at boot; phones, salaries and documents minimised in DTOs, logs and fixtures | CG-SEC-05 · CG-SEC-06 · CG-SEC-07 · CG-SEC-11 |
| 30 | ASVS V15 · Top 10 A03:2025 | Secure architecture; dependencies and the supply chain are controlled | Few, pinned, audited dependencies; no install from git URLs | CG-DEP-01 · CG-DEP-03 · CG-DEP-05 |
| 31 | ASVS V16 · Top 10 A09 / A10:2025 | Security logging; errors handled deliberately, failing closed | Audit by interceptor and DB trigger; problem details without internals; never log secrets; captcha and permission checks fail closed | CG-SEC-10 · CG-ERR-02 · CG-ERR-06 · CG-OBS-03 |
| 32 | Top 10 A01 · A05:2025 | Broken access control is first; injection is still in the top five | The security pass of a review starts with the decorator, the scope tests and every raw SQL statement | CG-REVIEW-04 |
| 33 | NestJS docs | Guards decide access, pipes validate, interceptors wrap, exception filters format errors | Session / CSRF / permission guards are global; Zod pipes; the audit interceptor; one problem-details filter | CG-API-01 · CG-API-02 · CG-ERR-02 |
| 34 | Next.js docs | Server Components by default; `'use client'` at the leaves; `server-only` for server code | The `site/` tree is server-rendered with tagged caches; the `staff/` tree is a client app on TanStack Query; no mutations in Next.js | CG-UI-01 · CG-UI-02 · CG-ARCH-06 |
| 35 | Prisma docs | Interactive transactions stay short; raw SQL through tagged templates; migrations can be customised with SQL | One transaction runner; `$queryRaw` tagged templates only; SQL-first migrations for constraints Prisma cannot express | CG-DB-01 · CG-DB-04 · CG-DB-05 · CG-DB-10 |
| 36 | PostgreSQL docs | READ COMMITTED: each statement sees what was committed before it began; REPEATABLE READ: one snapshot from the first statement | Writers run READ COMMITTED and check after their locks; snapshots are for reports only | CG-DB-06 |
| 37 | PostgreSQL docs | Avoid deadlocks by taking locks in a consistent order; transaction-level advisory locks release themselves | One lock order in every module; `pg_advisory_xact_lock` only, through named helpers | CG-DB-07 · CG-DB-08 |
| 38 | Conventional Commits | `<type>(<scope>): <description>` + trailers | Scope = the OpenSpec change id; trailers carry the IDs | CG-GIT-02 |
| 39 | Test pyramid | Many fast unit tests, fewer integration tests, very few end-to-end tests | Unit = pure money / date / availability rules; integration = real PostgreSQL; e2e = the flows of AD-QA-03 / FE-QA-02 | CG-TEST-01 |
| 40 | RFC 9457 | One machine-readable error format, extensible | `application/problem+json` with `code` = the language key | CG-ERR-02 · CG-I18N-01 |
| 41 | WCAG 2.1 AA | Perceivable, operable, understandable, robust | axe in CI on the flow pages; labels, focus, 44 px targets | CG-UI-10 |

---

## 2. Principles — what every other rule derives from

**CG-PRIN-01 · Correctness of money comes first.** 🔒 ADR-001 (Context) · D-PLT-04 · D-VIS-08\
When speed of delivery, elegance or performance conflicts with a correct amount, a correct business date or a correct permission check, correctness wins and the conflict is said out loud in the PR.\
*Why:* load is not a design driver here (< 5 requests / s); a 1-kyat drift between receipt and closing is.\
*Enforced by:* Review.

**CG-PRIN-02 · Simple over clever.** ⚠️\
Write the plainest code that satisfies the spec: no generic framework for one use, no abstraction before the third real use, no metaprogramming where a function does it. Code a new developer can follow from the repo and the docs is a requirement (D-PLT-06).\
*Why:* two developers hand this system over; cleverness is the part that does not survive a handover.\
*Enforced by:* Review — the "what can we remove?" pass (CG-REVIEW-03).

**CG-PRIN-03 · Explicit over implicit.** ⚠️\
No hidden conversions, default scopes, magic numbers or global patches. A status is a named constant, a limit is a named constant, a time comes from the clock that was passed in, a transaction is the `tx` that was passed in.\
*Why:* the implicit default ("no branch filter = all branches") is how a manager sees another branch's sales.\
*Enforced by:* Both — CI: CG-TS-04, CG-TS-08, CG-TIME-03 lints; Review.

**CG-PRIN-04 · Small modules with deep interfaces.** ⚠️ (ADR-001 rule 1)\
A module exposes a few functions that do a lot (`DayLock.assertOpen`, `StockLedger.post`, `EffectiveSale`) and hides its tables, queries and helpers. A public surface that mirrors the table columns is a shallow module — redesign it.\
*Why:* callers of a deep interface cannot forget the lock, the audit row or the stock movement — it is inside.\
*Enforced by:* Review.

**CG-PRIN-05 · Fail loudly.** ⚠️\
An impossible state throws; an unknown status code throws; a missing setting, env variable or translation key fails the build or the boot — never a silent fallback value in money, permission or date code.\
*Why:* `?? 0` on a missing price sells a haircut for nothing and nobody is told.\
*Enforced by:* Both — CI: CG-TS-05, CG-SEC-05, CG-I18N-02; Review.

**CG-PRIN-06 · One source of truth — and the database has the final word.** 🔒 API-ERR-03 · API-IDEM-05 · D-ROLE-08 · D-PLT-16\
Each fact is defined once: a validation rule in one Zod schema (form = API = OpenAPI); permission codes in `permissions.json`, settings in `settings.json`; status codes in one constants file; table shape in `point-sdd/docs/db`. Rules the DB can enforce (exclusion, unique, CHECK, immutability triggers) stay in the DB even when the API also checks them.\
*Why:* if a code change forgets a rule, the constraint still refuses the row.\
*Enforced by:* Both — CI: OpenAPI contract diff (CG-API-08), DB constraint tests (CG-DB-01); Review.

---

## 3. TypeScript — language rules

**CG-TS-01 · Strict compiler, no silent suppressions.** 🔒 D-ENG-01 (TypeScript strict) + ⚠️\
One `tsconfig.base.json` for every package: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns` and `noFallthroughCasesInSwitch`. `@ts-ignore` is banned; `@ts-expect-error` and `eslint-disable` need a reason on the same line and are not allowed in money, permission or date code — the one cast the money module needs (CG-MONEY-02) is exempted by an ESLint override for that file, not by an inline disable. (`exactOptionalPropertyTypes` stays off: Prisma inputs and React Hook Form pass explicit `undefined`.)\
*Why:* `items[0].unit_price_amount` on an empty array is a crash at checkout that `noUncheckedIndexedAccess` reports at compile time.\
*Enforced by:* CI — `tsc --noEmit` (Turborepo `typecheck`) · `@typescript-eslint/ban-ts-comment` · `eslint-comments/require-description`.

**CG-TS-02 · No `any`; `unknown` plus narrowing at every boundary.** ⚠️ (Google TS)\
`any` is not written and not accepted from libraries: values from HTTP, jobs, sockets, env, `JSON.parse`, `catch` and raw SQL are `unknown` until a Zod schema or a type guard has narrowed them.\
*Why:* an `any` that reaches a total turns a string `"7000"` into `"70003000"` without an error.
```ts
// Don't
const body = (await res.json()) as Sale;
// Do
const body = saleDetailSchema.parse(await res.json());
```
*Enforced by:* CI — `@typescript-eslint/no-explicit-any` · `no-unsafe-assignment` · `no-unsafe-member-access` · `no-unsafe-call` · `no-unsafe-return` · `no-unsafe-argument`.

**CG-TS-03 · No non-null assertion, no narrowing cast.** ⚠️ (Google TS)\
`x!` is banned. `as` is allowed only as `as const` or to widen; a cast that narrows is replaced by a parse, a type guard or an explicit `if (!x) throw`. The brand cast inside the money module (CG-MONEY-02) is the one exception, switched off for that file by an ESLint override.\
*Why:* `sale.customer!.phone` works in every demo and throws on the first anonymous walk-in (phone is optional).\
*Enforced by:* CI — `@typescript-eslint/no-non-null-assertion` · `@typescript-eslint/no-unsafe-type-assertion`.

**CG-TS-04 · Status and type values are `as const` objects with the smallint codes — no `enum`, no raw numbers.** 🔒 D-DB-03 · API-DATA-04 · AD-IMPL-04\
Every status / type lives in `packages/shared/src/constants` as a const object whose values are the DB codes, plus its union type. Code compares against the constant name, never a number; the label is `status.<table>.<CONST>`. A new code = constant + DB CHECK + logic, in one change; a code's meaning never changes and a number is never reused. TypeScript `enum` is not used (overrides the Google guide — a numeric enum accepts any `number` and emits runtime reverse-mapping code; a const object gives a closed literal union that Zod and OpenAPI `x-enum-varnames` are derived from).\
*Why:* `if (sale.status === 2)` survives every review until someone reads it as "COMPLETED".
```ts
// packages/shared/src/constants/status.ts
export const SaleStatus = { CANCELLED: 0, OPEN: 1, FINISHED: 2 } as const;
export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];
export const saleStatusSchema = z.enum(SaleStatus);        // Zod 4: accepts the const object

if (sale.status !== SaleStatus.OPEN) {
  throw new ProblemException('invalid_transition', 409, { context: { status: sale.status } });
}
```
*Enforced by:* CI — `no-restricted-syntax` (`TSEnumDeclaration`) · `point/no-raw-status` (a numeric literal compared with or assigned to a member named `status` or ending in `_status`; type / kind / source codes are covered by review).

**CG-TS-05 · A `switch` on a status or type is exhaustive.** ⚠️ (Google TS — every switch has a default)\
The `default` branch calls `assertNever(value)`; `if / else if` chains over a status are written as a `switch`.\
*Why:* when a status is added, every place that must handle it stops compiling instead of falling through to "else = paid".
```ts
switch (visit.status) {
  case VisitStatus.STARTED:    return 'in_service';
  case VisitStatus.COMPLETED:  return 'awaiting_payment';
  case VisitStatus.FINISHED:   return 'done';
  case VisitStatus.INCOMPLETE: return 'incomplete';
  default: return assertNever(visit.status);
}
```
*Enforced by:* CI — `@typescript-eslint/switch-exhaustiveness-check`.

**CG-TS-06 · Immutable by default.** ⚠️ (Google TS)\
`const` unless reassigned, never `var`; parameters are not reassigned or mutated; DTOs, snapshots and rule inputs are `readonly` / `Readonly<T>`; arrays are copied (`toSorted`, spread), not sorted or spliced in place.\
*Why:* a totals function that sorts its input in place reorders the lines on the receipt.\
*Enforced by:* CI — `prefer-const` · `no-var` · `no-param-reassign` (`props: true`) · `@typescript-eslint/prefer-readonly`.

**CG-TS-07 · Every promise is awaited or deliberately handed off; a transaction runs its statements one by one.** ⚠️\
No floating promises; no `async` callback in `forEach`; `return await` inside `try`. Inside a database transaction statements are awaited sequentially in the lock order — no `Promise.all` on the same `tx`. Outside a transaction, independent reads may run in parallel.\
*Why:* a floating `payments.create()` lets FINISH return before the payment exists; a `Promise.all` inside a transaction takes row locks in a random order (CG-DB-07).\
*Enforced by:* Both — CI: `@typescript-eslint/no-floating-promises` · `no-misused-promises` · `await-thenable` · `return-await` (`in-try-catch`); Review for `Promise.all` on `tx`.

**CG-TS-08 · Conditions are explicit.** ⚠️ (Google TS — `===`)\
`===` / `!==` only. A number, string or nullable value is never used as a condition by itself: compare with `=== 0`, `=== null`, `.length > 0`. Nullish defaults use `??`, never `||`.\
*Why:* `if (discount_amount)` skips a legitimate discount of 0, and `rate || 15` turns a 0 % tier into 15 %.\
*Enforced by:* CI — `eqeqeq` · `@typescript-eslint/strict-boolean-expressions` (numbers, strings and nullable primitives not allowed) · `@typescript-eslint/prefer-nullish-coalescing`.

**CG-TS-09 · `null` means "no value"; `undefined` means "not sent".** ⚠️ (API-SHAPE-04 PATCH = "only fields sent")\
JSON and DB absence is `null` (`customer_id: null`). In a `PATCH` body an absent key (`undefined`) leaves the column untouched and `null` clears it; Zod schemas say which is allowed (`.optional()` vs `.nullable()`). A possibly-`undefined` value is never passed into a Prisma `where` (CG-DB-04).\
*Why:* a PATCH that treats "not sent" as `null` wipes the customer from a sale when only the note was edited.\
*Enforced by:* Both — CI: schema tests; Review.

---

## 4. Naming and file layout

**CG-NAME-01 · Use the domain's words.** 🔒 D-DB-01 · AD-COPY-01\
Identifiers are English and use the glossary / DB terms exactly: booking ≠ visit ≠ sale ≠ payment ≠ refund ≠ adjustment; `performer`, `collected_by`, `recorded_by`. A table, column or data-field name never contains `barber` or a vendor name (D-DB-01: `*_employee_id`, `*_user_id`); names the locked design fixes — `@Staff()`, `app/staff/`, `PublicBarber`, `/v1/public/barbers`, `report_barber_performance.view`, `site.show_barbers` — keep their locked spelling. Suffixes carry the unit: money ends in `amount` / `_amount`, instants in `_at`, calendar dates in `_date`, durations in `_minutes`. Functions: `get…` throws when missing, `find…` returns `null`, `assert…` throws a problem error, `is… / has… / can…` return a boolean.\
*Why:* the money and time lints (CG-MONEY-03, CG-TIME-03) find values by these suffixes; `price` vs `unit_price_amount` vs `cost` in one module is how the wrong one gets summed.\
*Enforced by:* Review.

**CG-NAME-02 · Data fields are snake_case end to end; code is camelCase — there is no mapping layer.** 🔒 API-SHAPE-03 · D-DB-01 + ⚠️\
A data field has **one** name everywhere: DB column = Prisma field = Zod key = JSON field = form field name = test fixture key (`collected_by_employee_id`). Prisma models are named as their tables and no field is renamed with `@map`. Everything that is not a data field follows the Google guide: `lowerCamelCase` variables, parameters and functions, `UpperCamelCase` types, classes and components, `CONSTANT_CASE` module-level constants. Destructured data fields keep their name.\
*Why:* a camelCase ↔ snake_case mapper is one more place to drop a field, and one name means one `grep` finds the column, the DTO, the form and the test.
```ts
const { total_amount, business_date } = sale;        // data fields keep their names
const isFullyPaid = paidSoFar >= total_amount;        // everything else is camelCase
```
*Enforced by:* CI — `@typescript-eslint/naming-convention` (snake_case allowed only for properties, type properties and destructured variables).

**CG-NAME-03 · Files carry their role in the name; exports are named.** ⚠️ (Google TS · NestJS docs)\
One main export per file, named after it. API and shared code is kebab-case with a role suffix: `sales.module.ts`, `sales.controller.ts`, `sales.service.ts`, `repositories/sales.repository.ts`, `sale-totals.rule.ts` (pure rule), `sales.mapper.ts`, `sales.events.ts`, `receipt-render.job.ts`. A React component file is named after its component (`packages/ui/src/components/MoneyInput/MoneyInput.tsx`). Unit tests sit beside the code as `*.test.ts(x)`; API integration tests live in `apps/api/test/`; Playwright specs are `e2e/**/*.spec.ts`. No default exports except where Next.js requires one (`page.tsx`, `layout.tsx`, `error.tsx`, `loading.tsx`, `not-found.tsx`, `proxy.ts`, config files). No `utils.ts`, `helpers.ts`, `common.ts` or `misc.ts`.\
*Why:* a predictable name is how Claude Code and a new developer find the one place a rule lives.\
*Enforced by:* CI — `import-x/no-default-export` (with the Next.js override) · `unicorn/filename-case` (per folder) · `pnpm guards` (banned file names).

**CG-NAME-04 · Layout: one folder per bounded context in the API, one folder per URL segment in the web app.** 🔒 ADR-001 (action items 1–2) · ADR-016 · AD-IMPL-03\
The layout is the one fixed by the `add-repo-scaffold` design (D1) and `docs/engineering/module-map.md`; the sketch is a reading aid and the scaffold wins.
```
apps/api/src/
  common/                       # config · database (TransactionRunner) · http (RequestContext, problem filter)
                                # access (decorators, guards) · logging — cross-cutting, no business rule
  modules/<context>/            # auth people catalog scheduling booking delivery sales cash-closing
    index.ts                    #   commission payroll finance inventory platform — the ONLY import path for other modules
    *.module.ts  *.controller.ts  *.service.ts  repositories/  *.rule.ts  *.mapper.ts  *.events.ts
apps/api/test/                  # integration tests · fixtures/ · support/ (test application only)
apps/web/
  proxy.ts                      # host rewrite: <domain> → app/site, app.<domain> → app/staff
  app/site/…                    # public website + booking modal (server components first)
  app/staff/…                   # staff / admin PWA (client components); app/staff/dev/ui = the catalogue
packages/shared/                # src/schemas · constants · money · time · format · permissions · errors; definitions/*.json
packages/ui/                    # tokens.css · src/primitives (shadcn) · src/components/<Name>/ · src/status/status-map.ts
packages/i18n/                  # messages/my/*.json · messages/en/*.json
packages/documents/             # receipt / payslip / poster templates + fonts (ADR-013)
db/                             # source/ (copies of point-sdd docs/db + manifest) · migrations/ · schema.prisma
e2e/                            # Playwright specs
tools/                          # eslint-plugin-point · eslint/ · guards/ · claude-hooks/
docs/engineering/  docs/ops/    # this file, module-map.md, db-changes.md · runbooks (D-PLT-06)
```
Route folders are kebab-case and equal the URL segment; a folder that is not a route starts with `_`.\
*Why:* module boundaries are enforced by lint on import paths — that only works if the paths are regular.\
*Enforced by:* Both — CI: `no-restricted-imports` / `import-x/no-restricted-paths` (CG-ARCH-04); Review.

**CG-NAME-05 · Codes and keys come from the typed catalogues — a free string does not compile.** 🔒 D-ROLE-08 · D-PLT-16 · ADR-002 (action item 1) · AD-PERM-03\
Permission codes, setting keys, notification types, job names, realtime event names, error codes and language keys come from the typed catalogues of `packages/shared` (`definitions/permissions.json`, `settings.json`, `notifications.json`, `constants/error-codes.ts` …) — a value that is not in the catalogue does not compile. A code is never renamed or reused after deploy.\
*Why:* `@Can('sale.refnd')` typed as a free string compiles and denies every admin; typed from the JSON it is a build error.\
*Enforced by:* CI — `tsc` (the access decorators, `can()`, the jobs service, `RealtimePublisher`, `ProblemException` and `t()` accept only the typed unions).

---

## 5. Architecture — module boundaries

**CG-ARCH-01 · One NestJS module per bounded context, one public surface.** 🔒 ADR-001 (Decision · action item 2)\
Each context (`auth`, `people`, `catalog`, `scheduling`, `booking`, `delivery`, `sales`, `cash-closing`, `commission`, `payroll`, `finance`, `inventory`, `platform` — `docs/engineering/module-map.md`) is one folder whose `index.ts` exports its module class, its service interfaces and its public types — nothing else. Other modules import only from that `index.ts`.\
*Why:* a deploy is one process, so the only thing keeping `payroll` out of the `sales` tables is the import rule.\
*Enforced by:* CI — `no-restricted-imports` (`tools/eslint/boundaries.mjs`: another module only through its `index.ts`).

**CG-ARCH-02 · A module writes only its own tables; effects in another module go through that module's service, in the caller's transaction.** 🔒 ADR-001 rule 1 · system design §3.4\
The Prisma client is used only in a module's `repositories/` folder (and `common/database`). A cross-module effect that must commit together with the business write is a **service call that receives the caller's `tx`** — `DayLock.assertOpen(tx, …)`, `PayrollLock.assertNotFinalized(tx, …)`, `StockLedger.post(tx, …)`, `Expenses.createAuto(tx, …)`, `Attachments.link(tx, …)` — never a direct insert and never an event. A module reads another module's data through that module's surface; a read-only join across modules is an exception the change's design.md names (the report queries of ADR-015 are the standing one).\
*Why:* if `sales` inserts a stock movement itself, the stock level cache, the negative-stock warning and the ledger's append-only rule are skipped.
```ts
// sales.service.ts — inside the FINISH transaction
await this.stockLedger.post(tx, usageOfSale(sale));       // inventory's service, the caller's tx
// Don't: await tx.stock_movements.createMany({ … })     // another module's table
```
*Enforced by:* Both — CI: `no-restricted-imports` (the Prisma client outside `repositories/` and `common/database`) + `pnpm guards` table-ownership check (a repository writing a table that `module-map.md` gives to another module); Review.

**CG-ARCH-03 · Domain events are emitted after commit, are best-effort and carry ids only.** 🔒 ADR-002 (event rule) · ADR-008 · API-RT-02 · D-DB-12\
In-process events (`sale.finished` → notifications, realtime, estimates) are published after the transaction commits; there is no outbox table, so a consumer must be able to recompute from data and must never be the only place a fact is stored. Realtime goes through `RealtimePublisher` only, to the rooms the API design names; **no payload carries an amount** — ids and status, then the client refetches. Private or person-sensitive events go to `user:` rooms, never `branch:` or `company`.\
*Why:* a salary figure pushed to the `company` room reaches every phone with any company-scope grant.\
*Enforced by:* Both — CI: payload-schema test: no event schema in `packages/shared/realtime` has a key matching `amount` (ADR-008 action item 6); Review.

**CG-ARCH-04 · Dependencies point one way.** ⚠️\
`packages/shared` imports no internal package; `packages/ui` → `shared`, `i18n`; `apps/*` → `packages/*`; `apps/api` and `apps/web` never import each other. Inside the API: controller → service → repository / rule; `common/*` never imports a module; modules reach each other only through `index.ts`; `*.rule.ts` imports nothing but `packages/shared`. No import cycles. The two web trees never import from each other (CG-UI-01).\
*Why:* a cycle between `sales` and `cash-closing` means neither can be tested or reasoned about alone.\
*Enforced by:* CI — `import-x/no-restricted-paths` · `import-x/no-cycle`.

**CG-ARCH-05 · Background work is a pg-boss job behind the jobs service; handlers are idempotent and bound to the state they were scheduled for.** 🔒 ADR-002\
No `setTimeout`, `setInterval` or `node-cron` for business timing. Job names are constants; cron expressions run in `Asia/Yangon`. A job that must not be lost with its business write (`site.revalidate`, `receipt.render`, no-show timers) is enqueued **inside the same transaction**. A handler re-reads and locks its row and is a no-op when the state has moved on; it can run twice without a second effect; it throws on failure so pg-boss retries (3×, then `job.failed`). A new job is added to the ADR-002 table and appears in the jobs panel (P1.SYS.05).\
*Why:* an in-memory no-show timer disappears on the next deploy; a non-idempotent month-end job converts the same cash out twice.\
*Enforced by:* Both — CI: `no-restricted-globals` / `no-restricted-imports` (`setInterval`, `node-cron`; `pg-boss` outside the jobs service of the `platform` module) + a "run twice" unit test per handler with the fake clock (ADR-002 action item 2); Review.

**CG-ARCH-06 · The API is the only writer — no business logic in Next.js.** 🔒 ADR-001 rule 2 · API-META-04 · ADR-009 · FE-IMPL-01\
The web app never connects to the database, never computes money, prices, availability or permissions, and has no Server Actions that mutate and no route handlers under `/api`. Its only route handler is `/internal/revalidate` (ADR-006). `site/` server components read `GET /v1/public/*`; everything else is a browser call to `/api/v1`.\
*Why:* a second place that computes a total is a second answer to "what does the customer owe".\
*Enforced by:* CI — `no-restricted-imports` in `apps/web` (`@prisma/client`, `pg`, `apps/api`) · `pnpm guards` (`'use server'`; `check-web-api-routes.mjs` — a route handler under `apps/web/app/**/api/`).

**CG-ARCH-07 · Shared code has an address.** 🔒 ADR-001 rule 3 · AD-FMT-00 + ⚠️\
`packages/shared` holds what both API and web need and that has no I/O: Zod schemas and inferred types, constants and the three JSON catalogues, `money`, `time`, formatters, phone normalisation. It uses no Node-only and no browser-only API. Code used by one module stays in that module; code is moved to `shared` at its third real use, not its first.\
*Why:* a `shared/utils` that everything imports is a module boundary with a hole in it.\
*Enforced by:* Both — CI: `import-x/no-nodejs-modules` and `no-restricted-globals` (`window`, `document`) in `packages/shared`; Review.

**CG-ARCH-08 · Interfaces at real seams only.** ⚠️ (ADR-002 · ADR-007 · ADR-013 · ADR-014)\
Things outside the process sit behind one small interface with one implementation and one in-memory fake: `StorageService` (S3), the mail provider (Resend / Mailpit), `DocumentRenderer` (Chromium), the jobs service (pg-boss — `JobsService` in ADR-002), `RealtimePublisher` (Socket.IO), the clock, the captcha and Google clients. Business code never imports their SDKs. Internal services do **not** get an interface each "for testing" — they are tested with the real database (CG-TEST-04).\
*Why:* the seam is what lets the provider change (R2 ↔ B2, pg-boss ↔ BullMQ) without touching business code; an interface per class only doubles the files.\
*Enforced by:* CI — `no-restricted-imports` (`@aws-sdk/*`, `resend`, `pg-boss`, `socket.io`, the Chromium driver outside the one folder that wraps each).

**CG-ARCH-09 · Tunable values are settings, fixed limits are named constants, and the process keeps no business state.** 🔒 D-PLT-16 · ADR-014 #8 · ADR-015 #7 · API-LIM-03\
A value the owner may change is a key in `settings.json` read through the settings reader (never `process.env`, never a literal). A limit the design fixes in code (signed URL 5 minutes, 366 days, 50,000 / 5,000 / 1,000 rows, 15 s, 24 h) is a named export in one `limits.ts` with its source ID beside it. In-memory state is limited to the caches and stores an ADR names (Google hand-off store, 60-second booking-options cache, event coalescing).\
*Why:* a `5000` typed into three exporters becomes three different limits at the first change.\
*Enforced by:* Both — CI: `n/no-process-env` outside the config modules · `tsc` (setting keys typed from `settings.json`); Review for inline limits.

---

## 6. API implementation

**CG-API-01 · Controllers are thin.** ⚠️ (NestJS docs · Clean Code)\
A handler does four things: declares access (CG-API-02), validates input with a Zod pipe, calls **one** service method, returns the mapped DTO. No Prisma, no transaction (the service opens it — CG-DB-03), no `if` on business state and no `try / catch` in a controller; the only thing it does with a result is hand a refused outcome to the shared outcome → problem mapper (CG-DB-03). Each handler carries its endpoint ID from the API part file in a JSDoc line. `/api` comes from the global prefix (`setGlobalPrefix('api')` — ADR-009); the version segment is written in the controller path and NestJS URI versioning is not enabled, so a path can never get a second `/v1` (scaffold design D5).\
*Why:* a rule written in a controller is skipped by the job, the import and the other endpoint that call the service directly.
```ts
@Controller('v1/expenses')                 // served as /api/v1/expenses — '/api' is the global prefix
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  /** P7.EXP.03 */
  @Post()
  @Idempotent()
  @Audited({ actions: ['expense.create'] })
  @Can('expense.create', { branch: 'body.branch_id?', empty: 'private' })
  create(@ZBody(createExpenseSchema) body: CreateExpenseBody, @IdempotencyKey() key: string) {
    return this.expenses.create(key, body);   // one call — the service opens the transaction
  }
}
```
*Enforced by:* Both — CI: `no-restricted-imports` (repositories and the Prisma client in `*.controller.ts`); Review.

**CG-API-02 · Exactly one access decorator per endpoint, with the target's data level.** 🔒 API-PERM-02 · API-PERM-07 · ADR-012 · D-ROLE-03\
Every handler declares exactly one of `@Can(code, { level | branch | orSelf … })`, `@CanView(module, { level? })`, `@Staff()`, `@Self()`, `@Public()`, `@Internal()` — as written in the endpoint table of its API part. A `@Staff()` endpoint that names a handler policy calls it as its first statement. Session and CSRF guards are global; no controller opts out.\
*Why:* an endpoint with no decorator is open to every signed-in barber; with two, nobody knows which one decides.\
*Enforced by:* CI — `point/one-access-decorator` (missing or second decorator fails the build) + the deny-path tests of CG-TEST-05.

**CG-API-03 · Every input is parsed by a Zod schema from `packages/shared` — one definition for the form, the API and OpenAPI.** 🔒 API-ERR-03 · ADR-001 rule 3 · API-DATA-02 (totals) · API-SHAPE-05 · API-DATA-06 + ⚠️ (strip policy, limits)\
Request and response shapes are Zod schemas; wire types are `z.infer` of them and are never written by hand (the domain form of a money-carrying body is the one exception — CG-MONEY-02). The API validates with the same schema the form uses (`@ZBody`, `@ZQuery`, `@ZParam`), and every other boundary — used headers, job data, socket payloads, internal-endpoint bodies, OAuth callbacks, environment variables — is parsed by a schema before any other code sees it. Ids are UUIDs; strings are trimmed and have a maximum length; arrays have a maximum size; numbers are integers in a stated range. ⚠️ Request objects are plain `z.object`: unknown members are **stripped**, never passed through (`.passthrough()` and `z.looseObject` are banned) — so a client-sent price or total is ignored (API-DATA-02) and an older cached app version keeps working. Zawgyi text is rejected by the API (`zawgyi_text`); phones are normalised to E.164 on the server. `class-validator` / `class-transformer` are not used.\
*Why:* a form that accepts what the API rejects (or the reverse) is a bug the barber meets at the chair; an unvalidated `limit=1000000` or a 5 MB "note" is a denial of service that needs no skill.
```ts
// packages/shared/src/schemas/expense.ts — the wire shape
export const createExpenseSchema = z.object({
  branch_id: z.uuid().nullable(),
  category_id: z.uuid(),
  amount: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),   // whole MMK as a JSON integer
  expense_date: businessDateSchema,
  description_mm: z.string().trim().max(500).optional(),
  paid_via: paidViaSchema,
  attachment_ids: z.array(z.uuid()).max(10).optional(),
});
export type CreateExpenseBody = z.infer<typeof createExpenseSchema>;
```
*Enforced by:* CI — `no-restricted-imports` (`class-validator`, `class-transformer`; `Body`, `Query`, `Param`, `Headers` from `@nestjs/common` in controllers) · `no-restricted-syntax` (`.passthrough()`, `z.looseObject`) · the start-up env schema · OpenAPI diff (CG-API-08).

**CG-API-04 · Output is mapped explicitly; public DTOs are separate classes of data.** 🔒 API-PUB-02 · API-SHAPE-02 · AD-PERM-05\
A service never returns a Prisma row. A mapper (`toSaleDetail(row)`) builds the DTO field by field — no spread of an entity — and the response is parsed by its schema in integration tests. Public endpoints use only DTOs and mappers under `apps/api/src/public/dto`, reviewed against the "never" list (customer names / phones, staff phone / e-mail, notes, earnings, user ids); a staff DTO is never reused for `/v1/public`.\
*Why:* `return { ...employee }` publishes the phone number, the salary flag and whatever column is added next year.\
*Enforced by:* Both — CI: `no-restricted-imports` (`public/**` may not import staff schemas; nothing outside `public/**` imports `public/dto`) + response-schema assertion in integration tests; Review.

**CG-API-05 · One shape for methods, status codes, resources and lists.** 🔒 API-SHAPE-03 · API-SHAPE-04 · API-DATA-08 · API-DATA-10 · API-LIM-03\
Plural kebab-case paths; actions are `POST …/<verb>`; no `GET` with side effects; `DELETE` only where the part file allows it. Create → 201 + `Location`, action → 200, async → 202, replay → 200 + `Idempotent-Replayed: true`. Create / update / action responses return the full resource (plus `warnings: []`). Lists are cursor-paginated `{ items, next_cursor, total }` with `limit` default 25 and ≤ 100; sort and filter keys are an allowlist per endpoint.\
*Why:* the client's "show it as saved" logic depends on every write answering with the same complete resource.\
*Enforced by:* Both — CI: OpenAPI diff against the contract (CG-API-08); Review.

**CG-API-06 · `PATCH` changes only what was sent; master-data edits carry `expected_updated_at`.** 🔒 API-SHAPE-04 · API-IDEM-04\
A `PATCH` schema marks every field optional and the service writes only the keys present. Mutable master records (employee, service, role, settings, a booking before start) accept `expected_updated_at`; a mismatch answers 409 `conflict`. POS actions rely on the state machine instead.\
*Why:* two admins editing one service on flaky 4G otherwise overwrite each other without a message.\
*Enforced by:* Both — CI: integration test per editable master resource (stale `expected_updated_at` → 409); Review.

**CG-API-07 · Permission first, then state — and the state is checked under the row lock.** 🔒 API-PERM-05 · API-IDEM-06\
The guard answers "may this caller do this here?" (403 / 404). The service then locks the row and answers "does the record's state allow it?" — 409 `invalid_transition`, 423 `locked` / `payroll_finalized`, 422 `day_closed`, with the `context` the API part defines. A state check done before the lock is repeated after it.\
*Why:* two phones pressing Finish and Cancel together both pass a check made before the lock.\
*Enforced by:* Both — CI: the concurrency tests of CG-IDEM-05; Review.

**CG-API-08 · The OpenAPI document is generated from the Zod schemas and diffed against the contract in `point-sdd`.** 🔒 API-META-01 · API-ERR-03\
`openapi:check` builds the document from code (`pnpm --filter api openapi`) and compares it with `../point-sdd/docs/api/openapi/*.yaml` for the endpoints already implemented: paths, methods, parameters, request and response schemas, status codes, `x-enum-varnames`. A difference fails the check; the contract is changed in `point-sdd` first, never to match the code after the fact.\
*Why:* the test-case generator, the web client and the next developer all read the contract; drift makes all three wrong at once.\
*Enforced by:* CI — `openapi:check` (`oasdiff` or equivalent; built by `add-ci-guard-rails`). Until the pipeline can read `point-sdd` (OPEN-CG-04) it runs on the developer's machine against the sibling folder, in the verification group, and is ticked in the PR (CG-GIT-04).

---

## 7. Database, migrations and transactions

**CG-DB-01 · Migrations are hand-written SQL, and the table design is changed in `point-sdd/docs/db` first.** 🔒 D-PLT-17 · D-DB-12 · ADR-001 (action item 4) · `docs/db/README.md`\
The design of record is `../point-sdd/docs/db` (DBML + `*-constraints.sql` + `*-test.sql`); `db/source/` holds byte-identical copies with a manifest of hashes. A database change is made in `point-sdd` first (version bump, README line, register note) and then here: a new forward-only migration `db/migrations/<timestamp>_<change-id>/migration.sql` written as SQL, the changed files replaced in `db/source/`, `prisma db pull` to refresh `db/schema.prisma` (never edited by hand, never used to generate DDL — `prisma migrate dev` without `--create-only` is not used), and `pnpm db:test` green. Every environment is migrated by the one entry point (`node db/scripts/migrate.mjs`, which runs `prisma migrate deploy`) at release — nobody applies SQL by hand. The steps are in `docs/engineering/db-changes.md`.\
*Why:* Prisma cannot express the exclusion constraint that stops a double booking; if the SQL is not in the migration, the rule exists only on one developer's laptop.\
*Enforced by:* CI — job `db`: migrate an empty PostgreSQL 16 · `pnpm db:check-introspection` (committed schema = the database) · `pnpm db:test` (the `*-test.sql` constraint tests); job `static`: manifest hash check of `db/source/`. `pnpm db:check-source` against `../point-sdd` runs locally, in the verification group.

**CG-DB-02 · An applied migration is never edited, and V1 migrations are additive only.** 🔒 system design §4.1 ("additive migrations only during V1") + ⚠️\
A merged migration file is frozen — a mistake is fixed by a new migration. During V1 a migration may add tables, nullable or defaulted columns, indexes and constraints; it does not drop or rename a table or column, narrow a type, or rewrite data in a money table. `prisma migrate reset` and `prisma db push` are for a developer's local database only.\
*Why:* rollback is "previous image tag"; that only works if the previous code still runs on the new schema.\
*Enforced by:* Both — CI: `pnpm guards` (`check-migrations` — a file under `db/migrations/` that exists on `main` is modified or deleted; `DROP TABLE` / `DROP COLUMN` / `RENAME` / `ALTER COLUMN … TYPE` in a new migration); Review.

**CG-DB-03 · One transaction per business action, opened by the service through the transaction runner.** 🔒 API-AUD-01 · D-AUD-02 · D-PLT-15 + ⚠️ (the pattern)\
There is one pattern, used everywhere:
1. **Who opens.** The service method that changes data calls `TransactionRunner.run(async (tx) => …)` once. There is no transaction interceptor and no transaction in a controller; business code never calls `prisma.$transaction`. A read that changes nothing opens no transaction.
2. **How `tx` travels.** `tx` is passed explicitly, as the first argument, to repositories and to other modules' services (`DayLock.assertOpen(tx, …)`, `Jobs.send(tx, …)`) — never through a global or a request-scoped holder.
3. **Request context.** The runner's first statement sets `app.user_id`, `app.session_id` and `app.request_id` for that transaction only (`set_config(…, true)`, the parameterised form of `SET LOCAL`), from the request context. The request id is always a UUID (API-ERR-01).
4. **Audit.** `@Audited()` on the handler only registers the audit intent. Inside `run()` the service calls `Audit.emit(…)` for what it did, or `Audit.skip()` on a replay or an unchanged repeat; the runner writes the application audit row inside the same transaction, just before commit. An `@Audited()` handler that returns without an emit or a skip fails.
5. **Jobs and events.** A job is enqueued inside the transaction; in-process and realtime events are collected during `run()` and emitted by the runner after commit (CG-ARCH-03, CG-ARCH-05).
6. **A refusal that must still be saved** (a wrong OTP increments the counter and writes `login.failed`): the work returns an outcome instead of throwing, `run()` resolves — the transaction commits — the service returns the outcome, and the controller hands it to the shared mapper that raises the `ProblemException`. A throw inside `run()` always rolls back.

The interactive transaction sets `maxWait` and `timeout` explicitly from `limits.ts` (the Prisma defaults, 2 s and 5 s, are too short for a day close that waits for its lock). `lock_timeout` with a single retry exists only where the system design allows it — the receipt-counter step — and inside the service. The API connects as the restricted role `point_app` (INSERT + SELECT only on `audit_events`), never as the owner or a superuser; the session time zone is `Asia/Yangon`, checked at start-up.\
*Why:* the audit triggers on the 18 money tables read `app.user_id` — a write outside the runner is a money change with no author; and two places that open transactions mean two transactions per request.
```ts
// common/database/transaction-runner.ts (shape)
run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return this.prisma.$transaction(
    async (tx) => {
      const { user_id, session_id, request_id } = this.context.current();   // empty string before sign-in
      await tx.$queryRaw`SELECT set_config('app.user_id', ${user_id}, true),
                                set_config('app.session_id', ${session_id}, true),
                                set_config('app.request_id', ${request_id}, true)`;
      const result = await work(tx);
      await this.audit.flush(tx);          // the application audit row — same transaction, just before commit
      return result;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: TX_MAX_WAIT_MS,             // limits.ts
      timeout: TX_TIMEOUT_MS,
    },
  );   // collected events are emitted after this promise resolves
}
```
*Enforced by:* CI — `no-restricted-syntax` (`$transaction` outside `common/database`) + integration tests: every money-table write of a request produces a trigger audit row with the actor; an `@Audited()` handler without an emit or a skip fails; a refused outcome leaves its rows committed.

**CG-DB-04 · Prisma is used plainly and only in repositories.** ⚠️ (Prisma docs)\
Repositories take `tx` (or the read client) as their first argument and return plain rows. Reads name their columns (`select`) on tables that hold private data; a possibly-`undefined` value is never put into `where` (Prisma treats it as "no filter") — turn on Prisma's strict-undefined check where the pinned version offers it. No nested writes into another module's tables, no `upsert` where a unique constraint plus a replay path is the design, no `$extends` magic that changes query results.\
*Why:* `findFirst({ where: { branch_id: maybeUndefined } })` returns a row of any branch — a scope leak that type-checks.\
*Enforced by:* Both — CI: `no-restricted-imports` (CG-ARCH-02); Review.

**CG-DB-05 · Raw SQL is for what Prisma cannot say — always as a tagged template, always parsed.** ⚠️ (Prisma docs · OWASP Injection Prevention)\
Use raw SQL for row locks (`FOR UPDATE`), advisory locks, range / exclusion-aware queries, generated columns, set-based updates and report queries. Write it only with `` tx.$queryRaw`…` `` / `Prisma.sql` / `Prisma.join`; values are always bind parameters. `$queryRawUnsafe`, `$executeRawUnsafe` and string-built SQL are banned; a dynamic identifier (sort column) comes from a constant allowlist map. The result is `unknown[]` until a Zod row schema parses it.\
*Why:* a search box concatenated into SQL is the one bug that hands over every customer's phone number.
```ts
async lockById(tx: Tx, id: string): Promise<SaleLockRow> {
  const rows = await tx.$queryRaw<unknown[]>`
    SELECT id, status, branch_id, business_date, total_amount
    FROM sales WHERE id = ${id}::uuid FOR UPDATE`;
  if (rows[0] === undefined) throw new ProblemException('not_found', 404);
  return saleLockRowSchema.parse(rows[0]);
}
```
*Enforced by:* CI — `no-restricted-syntax` (`$queryRawUnsafe`, `$executeRawUnsafe`, `Prisma.raw` outside the allowlist helper).

**CG-DB-06 · One business action = one transaction; writers run READ COMMITTED, take their locks first and check after.** 🔒 API-IDEM-06 · ADR-015 #1a · system design §3.6\
Everything an endpoint changes commits or rolls back together. A transaction that writes money, stock or pay data — day close and reopen included — runs **READ COMMITTED**, takes its locks first (CG-DB-07) and makes **every** check after the locks. `REPEATABLE READ READ ONLY` (with `statement_timeout` 15 s) is used only for previews, reports, exports and dashboards.\
*Why:* a REPEATABLE READ snapshot is fixed at the first statement — the lock call, before the wait — so a payment committed while a day close waited would be invisible and the day would close without it.
```ts
// sales.service.ts — FINISH (P4.SAL.10): the service opens the one transaction of the action (CG-DB-03)
finish(sale_id: string): Promise<SaleDetail> {
  const business_date = businessDateOf(this.clock.now());
  return this.db.run(async (tx) => {
    const { branch_id } = await this.sales.getById(tx, sale_id);                // plain read, no lock
    await this.dayLock.assertOpen(tx, branch_id, business_date);                // (1) day lock — shared
    await this.payrollLock.assertNotFinalized(tx, { dates: [business_date] });  // (2) payroll lock — shared
    const sale = await this.sales.lockById(tx, sale_id);                        // (3) rows: sale → visit → …
    // checks only now — they see everything committed before the locks were granted
    if (sale.status === SaleStatus.FINISHED) {          // a repeat: 200 with the current state, nothing written twice
      this.audit.skip();
      return this.sales.getDetail(tx, sale_id);
    }
    if (sale.status !== SaleStatus.OPEN) {
      throw new ProblemException('invalid_transition', 409, { context: { status: sale.status } });
    }
    // … the remaining locks in order, the writes, this.audit.emit({ action: 'sale.finish', … }) …
    return this.sales.getDetail(tx, sale_id);
  });
}
```
*Enforced by:* Both — CI: the race tests named in the specs (ADR-015 action item 5: a payment committed while a close waits is counted); Review.

**CG-DB-07 · There is one lock order, and the code's text order is the lock order.** 🔒 API-IDEM-06 · system design §3.6\
A transaction takes only the locks it needs but never out of this order: **(1) day lock** (`DayLock`, shared for writers; exclusive for close / reopen and then the first statement) → **(2) payroll lock** (`PayrollLock`, shared for writers; exclusive for finalize / reopen) → **(3) row locks:** sale → visit → booking → payments → receipt counter → cash-out / closing rows → stock-level rows last, sorted by (`branch_id`, `product_id`). Rows a single part adds keep the position its API part states. The design.md of a change lists its locks in this order and the service numbers its steps the same way.\
*Why:* two transactions that lock the same two rows in opposite orders deadlock at the busiest minute of the day.\
*Enforced by:* Both — CI: concurrency tests (CG-IDEM-05); a `40P01` deadlock in any environment is logged as an error and treated as a defect; Review.

**CG-DB-08 · Advisory locks are transaction-scoped and taken only through named helpers.** 🔒 API-IDEM-06 · ADR-013 · P4-RULE-09\
Only the transaction-level functions (`pg_advisory_xact_lock`, `pg_advisory_xact_lock_shared`, `pg_try_advisory_xact_lock`) — never the session-level ones. Each lock has one helper in the module that owns it — `DayLock` (cash-closing), `PayrollLock` (payroll), the idempotency key and `receipt:<entity_id>` (platform), the KBZPay reference (sales) — with a namespaced key (`day:`, `idem:`, `payref:`, `receipt:` …) listed in `docs/engineering/module-map.md`. No ad-hoc lock call in a service.\
*Why:* a session-level lock survives a rollback and a pooled connection — the next request on that connection inherits a locked day.\
*Enforced by:* CI — `pnpm guards` (`pg_advisory_lock`, `pg_advisory_lock_shared`, `pg_try_advisory_lock`, `pg_advisory_unlock` anywhere; any advisory call outside a `repositories/` file or `common/database`).

**CG-DB-09 · No query in a loop; every new query shape has its index.** ⚠️ (ADR-015 action item 2 · system design §4.4)\
Load related rows with one `IN` / join query, not one query per item; a list endpoint issues a fixed number of queries whatever the page size. A new filter or sort on a transactional table comes with an `EXPLAIN (ANALYZE)` on the one-year synthetic dataset in the PR, and a needed index is added to `docs/db` first. Lists are always bounded (`limit ≤ 100`) and ordered by a unique key.\
*Why:* the closing screen that runs one query per payment is fast with 5 test payments and slow on a real Saturday.\
*Enforced by:* Both — CI: integration helper `expectQueryCount(≤ n)` on list endpoints; Review (the `EXPLAIN` in the PR).

**CG-DB-10 · Transactions are short: no network call inside one.** ⚠️ (Prisma docs · ADR-002)\
Inside a transaction there is only SQL: no HTTP, no bucket, no mail, no Chromium render, no captcha check. Work that must follow the commit is a job enqueued in the transaction (`receipt.render`, `site.revalidate`) or an event after it. Input is validated and files are staged **before** the transaction opens.\
*Why:* a receipt render inside FINISH holds the receipt-counter row lock for seconds, and every other barber at that branch waits.\
*Enforced by:* Review (+ the seam rule CG-ARCH-08 keeps SDKs out of services).

**CG-DB-11 · Transactional rows are never hard-deleted and finished records are never updated.** 🔒 D-DAT-05 · D-VIS-08 · API-PERM-06 #3 · `docs/db` guard triggers\
`delete` in the API means archive, deactivate or cancel — the row stays. A real `DELETE` exists only where the API part allows it (own notification / session, the purge jobs, draft lines with an audit diff); each such call carries `// hard-delete: <source ID>`. FINISHED / CANCELLED sales with their lines and payments, FINISHED / INCOMPLETE visits, CLOSED days and FINALIZED+ payroll runs are corrected only by new rows (adjustment, refund, difference sale, reopen) with a reason. The DB triggers are the guarantee; the service check is the polite answer (409 `invalid_transition` / 423 `locked`).\
*Why:* a deleted payment cannot be explained to the owner at closing; a new row with a reason can.\
*Enforced by:* Both — CI: `pnpm guards` (`.delete(`, `.deleteMany(`, `DELETE FROM` without the `hard-delete:` comment) + the trigger tests of `pnpm db:test`; Review.

**CG-DB-12 · Constraint errors are mapped to API codes in one place.** 🔒 API-IDEM-05 · API-ERR-02 · system design §3.5\
One mapper in `common/database` turns database errors into `ProblemException`s by SQLSTATE and constraint name: exclusion violation `23P01` on the booking range → 409 `slot_taken`; unique violation `23505` on the KBZPay reference → 409 `duplicate_reference`, on a `client_request_id` index → 409 `idempotency_in_progress` (below); `P0001` `finished_immutable` → 423 `locked`; `57014` on a report → 422 `report_timeout`. Anything unmapped — including a CHECK violation `23514` — is a 500 and a bug: the API should have refused it first. Services do not `catch` Prisma errors themselves. A database error aborts its transaction — PostgreSQL refuses every further statement (`25P02`) — so the mapper never continues in it: the transaction rolls back and the answer is raised. That is why a unique violation on `client_request_id` (the last line behind the key's advisory lock — CG-IDEM-02) answers `idempotency_in_progress`: the client's retry with the same key takes the replay path in a new transaction. A `SAVEPOINT` is used only where a design names it (the receipt-counter step).\
*Why:* "first success wins" is implemented by the constraint; the mapper is what turns the loser's error into "this time was just booked".\
*Enforced by:* Both — CI: an integration test per mapped constraint; Review.

---

## 8. Money

**CG-MONEY-01 · Money is an integer number of kyats.** 🔒 D-PLT-04 · API-DATA-02 · D-DB-01\
Every amount is whole MMK: `bigint` in PostgreSQL, `Mmk` (a branded `bigint`) in all TypeScript code — API and browser — and a JSON **integer** on the wire. There is no fractional kyat anywhere and no second currency.\
*Why:* a 1-kyat drift between the receipt, the closing and the commission base is exactly the error this system exists to remove.\
*Enforced by:* CI — CG-MONEY-03 lint + OpenAPI diff (`type: integer` for every amount field).

**CG-MONEY-02 · `Mmk` is made and unmade only at the boundaries, by the money module.** 🔒 API-DATA-02 · AD-IMPL-05 · system design §3.6\
Three ways in and one way out, all in `packages/shared/src/money`: `moneyFromWire(number)` for a request or response body, `moneyFromDb(bigint)` for a column value in a repository, `parseMoneyInput(string)` for typed input; `moneyToWire(Mmk)` for a body (an `Mmk` is already a `bigint` for a database write). Schemas describe the wire, so `z.infer` gives `amount: number`; the domain form of a money-carrying body is a named type declared beside its schema together with its mapper — the one kind of type written by hand (CG-API-03). Services, rules, formatters and components take `Mmk` only: a bare `number` or `bigint` does not compile. Both locked texts hold — "JSON integer (never float, never string)" on the wire (API-DATA-02) and "money is bigint / string end-to-end" in code (AD-IMPL-05); the string form is not used on the wire. No global `BigInt.prototype.toJSON`, no `Number(…)` or `BigInt(…)` on an amount outside the money module.\
*Why:* `JSON.stringify` throws on a `bigint`, and the usual "fix" — a global patch — silently turns amounts into strings or lossy numbers.
```ts
// packages/shared/src/money — the only place a number or a bigint becomes money
export type Mmk = bigint & { readonly __brand: 'Mmk' };
export function moneyFromWire(value: number): Mmk {
  if (!Number.isSafeInteger(value)) throw new RangeError('amount is not a safe integer');
  return BigInt(value) as Mmk;                       // brand cast — this file only (ESLint override, CG-TS-01)
}
export const moneyFromDb = (value: bigint): Mmk => value as Mmk;
export function moneyToWire(amount: Mmk): number {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('amount outside the JSON-safe integer range');
  }
  return Number(amount);
}

// packages/shared/src/schemas/expense.ts — beside the wire schema of CG-API-03
export type CreateExpense = Omit<CreateExpenseBody, 'amount'> & { amount: Mmk };
export const toCreateExpense = (body: CreateExpenseBody): CreateExpense => ({
  ...body,
  amount: moneyFromWire(body.amount),
});
```
*Enforced by:* CI — `pnpm guards` (`BigInt.prototype.toJSON`) · `point/no-number-money` (CG-MONEY-03) · `tsc` (a `number` or a plain `bigint` is not assignable to `Mmk`).

**CG-MONEY-03 · No float and no bare operator on money — arithmetic lives in the money module.** 🔒 API-DATA-02 · AD-IMPL-05 · P5-RULE-20\
`+ - * / %`, unary `+`, `Math.*`, `parseFloat`, `parseInt`, `toFixed` and `Number()` are not applied to an amount outside `packages/shared/src/money` (`sumMoney`, `subtractMoney`, `multiplyMoney`, `maxMoney`, the conversions of CG-MONEY-02 and the percent, rounding and allocation helpers the later money changes add). The browser shows the server's numbers; a preview while typing (remaining to pay, change) uses the same helpers and is replaced by the server's answer.\
*Why:* `0.15 * 6500` is `975` today and `974.9999999999999` for another pair of numbers — and then the receipt and the closing differ by one kyat.
```ts
// Don't
const discount = Math.round((eligible * percent) / 100);
// Do — P4-RULE-06: 15 % of 6,500 = 975 → rounded to the nearest 100, half up → 1,000
const discount_amount = percentOfMoney(eligible_amount, percent, { roundToStep: discountRoundToAmount });
```
*Enforced by:* CI — `point/no-number-money` (`Number()`, `parseInt()`, unary `+` or an arithmetic operator on an identifier or member named `amount` or ending in `_amount` / `Amount`, outside the money module) · `parseFloat` banned in every workspace.

**CG-MONEY-04 · Rates are decimals, exactly as the database stores them.** 🔒 API-DATA-02 · P5-RULE-20\
`numeric(5,2)` rates (service charge, tax, commission tier) and `numeric(7,4)` values (effective rate, line rate, allocation ratio) are `Decimal` (`decimal.js`) in domain code and in `packages/shared` — a repository converts the `Prisma.Decimal` it reads at the edge, because the Prisma client is not available to shared or web code (CG-ARCH-06, CG-ARCH-07) — and JSON numbers with the stored scale on the wire. A rate is never converted to a JS `number` for arithmetic; an input rate is validated to the column's scale and built into a decimal from its string form.\
*Why:* a tier rate handled as a float makes two payroll runs of the same month disagree.\
*Enforced by:* Both — CI: unit tests of the money module (decimal in, integer out); Review.

**CG-MONEY-05 · Rounding happens only where a locked rule defines it.** 🔒 P4-RULE-06 · P5-RULE-20\
There is no "round to be safe". The defined places: percent discount → nearest `sales.discount_round_to_amount` (default 100), half up; service charge and tax → half up; commission → half up per tier; proration and daily rates → half up per segment / item. Each rounding call site carries the rule ID in a comment; a calculation that needs rounding and has no rule is an open question (CG-META-04).\
*Why:* two developers each "rounding sensibly" produce two payslips for one employee.\
*Enforced by:* Both — CI: table-driven unit tests with the examples of the API parts (975 → 1,000; 300,000 × 16 / 31 = 154,839); Review.

**CG-MONEY-06 · Totals are computed by the server; the client never sends one that is trusted.** 🔒 API-DATA-02 · API-DATA-07 · P4-RULE-06\
Subtotals, discounts, totals, change, expected cash, commission and payroll figures are computed in the API from stored rows. Service prices come from the server-side quote, never from the request (except an explicit override with a reason and `sale.override_price`). A price or total the client sends anyway is stripped by the schema (CG-API-03); where the contract carries one for comparison it is validated and a difference answers `amount_mismatch` / `total_changed`.\
*Why:* a phone with a stale price list must not be able to decide what a haircut costs.\
*Enforced by:* Both — CI: schema unit tests (an unknown member is stripped) and integration tests (a wrong client total is refused); OpenAPI diff; Review.

**CG-MONEY-07 · Parts always add up to their total.** 🔒 P5-RULE-20 · P4-RULE-06\
When an amount is split (a sale discount across lines, commission across branches, payroll allocation), the split uses the allocation helper of the money module — largest remainder — so Σ parts = total exactly. Every such function has a property-based test for the sum.\
*Why:* three lines of 333 for a 1,000 discount leave a kyat that shows up as an unexplained closing difference.\
*Enforced by:* CI — property-based unit tests (`fast-check`) on the allocation helper and on every function that calls it.

---

## 9. Time

**CG-TIME-01 · An instant is `timestamptz`; on the wire it is ISO 8601 with `+06:30`.** 🔒 D-PLT-15 · D-DB-01 · API-DATA-03\
`*_at` columns are `timestamptz`; the API renders them in Myanmar Time (`2026-10-05T10:42:00+06:30`) and accepts any offset. A `*_date` is a calendar date `YYYY-MM-DD` and is a **string** in domain code and DTOs — the repository converts at the edge; nobody calls `new Date(business_date)`. Times of day are `HH:mm`.\
*Why:* a `date` read as a JS `Date` at UTC midnight and printed in another zone moves a sale to the previous day.\
*Enforced by:* Both — CI: schema types (`businessDateSchema` is a string schema; OpenAPI diff); Review.

**CG-TIME-02 · `business_date` is computed by the server, in Asia/Yangon, by one function.** 🔒 D-PLT-15 · API-DATA-03 · AD-FMT-11\
`businessDateOf(instant)` in `packages/shared/src/time` is the only place an instant becomes a business date. The client never sends a business date except where an API part allows it, and those values are validated (`date_in_future`, `day_closed`).\
*Why:* a sale at 00:10 MMT on 01/Nov booked to October breaks the receipt counter, the closing and the commission month together.
```ts
// Don't — the UTC date is still "yesterday" from 00:00 to 06:29 MMT
const business_date = new Date().toISOString().slice(0, 10);
// Do
const business_date = businessDateOf(this.clock.now());
```
*Enforced by:* CI — `pnpm guards` (`toISOString().slice(`, `toISOString().split(`) + the boundary tests of CG-TIME-05.

**CG-TIME-03 · Time comes from the injected clock.** ⚠️ (ADR-002 action item 2 — handlers tested with a fake clock)\
`new Date()` without arguments and `Date.now()` are allowed only inside the clock implementation — the API's clock and `ClockProvider` in the web app. Services and job handlers receive the clock; components read `useNow()`; pure rule functions take `now` as a parameter. SQL `now()` is for `created_at` / `updated_at` defaults only — a business timestamp is a bind parameter from the clock.\
*Why:* a no-show timer, a 14-day window or a month-end job cannot be tested if the code asks the machine what time it is.\
*Enforced by:* CI — `no-restricted-syntax` (`NewExpression[callee.name="Date"][arguments.length=0]`, `Date.now()`) outside the API clock and `ClockProvider`.

**CG-TIME-04 · One date library, no offset arithmetic, half-open ranges.** ⚠️ (OPEN-CG-05 for the library)\
Zone conversion and calendar maths go through `packages/shared/src/time` (built on one library — proposed: `date-fns` with `@date-fns/tz`) with the zone name `Asia/Yangon` — never a fixed offset such as `+ 6.5 * 3600 * 1000` or "add 390 minutes". Local-time `Date` getters / setters (`getDate`, `getHours`, `setHours` …) are not used — the result depends on the machine's zone. A period of instants is half-open — a day is `[00:00 MMT, next 00:00 MMT)`; date filters use the `business_date` column (`from` and `to` inclusive — API-DATA-08), not zone maths on `*_at`.\
*Why:* code using `getHours()` passes on a laptop in Yangon and fails on a server in UTC.\
*Enforced by:* CI — `no-restricted-syntax` (local `Date` getters / setters outside `packages/shared/src/time` and `src/format`) · the unit suites of `time/` and `format/` run under `TZ=UTC`, `TZ=Asia/Yangon` and `TZ=America/Los_Angeles`.

**CG-TIME-05 · Day and month boundaries are tested for every date rule.** 🔒 D-PLT-15 · system design §3.6 · `spec-fixtures.md` §5\
Any rule that uses a date has tests at the business boundaries of `spec-fixtures.md` §5 — `23:59` and `00:00` MMT, the month boundary `2026-10-31T23:59:00+06:30` (October) and `2026-11-01T00:00:00+06:30` (November — the receipt counter restarts) — and, for monthly figures, a 28-, 30- and 31-day month. One more case is technical, not a business boundary: UTC midnight (06:30 MMT), the instant where a UTC-based bug shows.\
*Why:* these are the minutes where a date bug appears, and they happen every night.
```ts
it.each([
  ['2026-10-04T23:59:59+06:30', '2026-10-04'],
  ['2026-10-05T00:00:00+06:30', '2026-10-05'],
  ['2026-10-31T23:59:00+06:30', '2026-10-31'],
  ['2026-11-01T00:00:00+06:30', '2026-11-01'],
  ['2026-10-04T23:59:59Z',      '2026-10-05'],   // technical case: one second before UTC midnight = 06:29:59 MMT
])('businessDateOf(%s) = %s', (instant, expected) => {
  expect(businessDateOf(new Date(instant))).toBe(expected);
});
```
*Enforced by:* Both — CI: the tests exist for `packages/shared/src/time` (coverage floor, CG-TEST-10); Review for each new date rule.

**CG-TIME-06 · The browser asks the server what day it is, and shows time through the formatter.** 🔒 API-AUTH-05 · AD-FMT-00 · D-PLT-05\
"Today" and "now" in the web app come from the server time in `/v1/me` (staff) or `server_time` (public site), which seeds `ClockProvider`; components read `useNow()`, and the device clock is used only to advance that value by the elapsed time. Dates and times are displayed with `formatDate` / `formatTime` / `formatDateTime` (`05/Oct/2026`, `2:30 PM`, digits 0–9) — no `toLocaleString`, no `Intl.DateTimeFormat` in components.\
*Why:* a barber's phone set to the wrong date would otherwise preselect the wrong business day for a late entry.\
*Enforced by:* CI — `no-restricted-syntax` (`toLocaleString`, `toLocaleDateString`, `toLocaleTimeString`, `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat` outside `packages/shared/src/format`).

---

## 10. Errors

**CG-ERR-01 · Never swallow an error.** ⚠️ (Google TS · OWASP Top 10 A10:2025)\
No empty `catch`, no `catch` that only logs, no `.catch(() => undefined)`. Catch only where the error can be handled (map a known database error, show a form error); otherwise let it reach the filter, the job runner or the error boundary. A re-thrown error keeps its `cause`.\
*Why:* a swallowed error in the payment path looks like success on the phone and a missing payment at closing.
```ts
// Don't
try { await this.stockLedger.post(tx, usage); } catch (e) { this.log.warn(e); }
// Do — let it fail: the transaction rolls back and the client sees the problem
await this.stockLedger.post(tx, usage);
```
*Enforced by:* Both — CI: `no-empty` · `@typescript-eslint/only-throw-error` · `@typescript-eslint/use-unknown-in-catch-callback-variable` · `preserve-caught-error`; Review for log-only catches.

**CG-ERR-02 · One exception filter turns every failure into RFC 9457 problem details.** 🔒 API-ERR-01\
All errors leave the API as `application/problem+json` with `type`, `title`, `status`, `code`, `detail`, `errors[]`, `context` and `request_id`. An unexpected error becomes 500 with only the `request_id` — no message, stack, SQL or table name. Binary endpoints answer errors in the same format.\
*Why:* the `request_id` on the barber's error screen is the handle that finds the stack trace in Sentry.\
*Enforced by:* CI — integration tests (validation, forbidden, not found, conflict and an injected crash all match `problemSchema`).

**CG-ERR-03 · Business failures are raised as `ProblemException` with a code from the catalogue.** 🔒 API-ERR-02 · API-ERR-01\
Modules raise `new ProblemException(code, status, { detail?, errors?, context? })`; the code comes from `packages/shared/src/constants/error-codes.ts` and the `context` has the shape its API part defines. A new code is added to the API part in `point-sdd`, the catalogue and **both** language files in the same change. NestJS `HttpException` classes and free-text messages are not thrown by business code. A refusal that must leave rows behind (a wrong OTP still increments the counter) is not thrown inside the transaction: the service returns an outcome after the commit and the controller's shared mapper raises the `ProblemException` (CG-DB-03 #6).\
*Why:* `code` is the language key — a code that exists only in a `throw` shows the barber a raw key instead of a sentence.
```ts
throw new ProblemException('day_closed', 422, {
  context: { branch_id, business_date, closed_at, closed_by, correction_path: 'reopen' },
});
// Don't
throw new BadRequestException('Day is closed');
```
*Enforced by:* CI — `no-restricted-imports` (`HttpException` and its subclasses outside `common/http`) · `pnpm i18n:check` (every catalogue code has `error.<code>` in `my` and `en`).

**CG-ERR-04 · Text shown to a user comes only from language keys.** → see **CG-I18N-01** (an API problem's `title` and `detail` are developer strings and are never rendered; the client shows `error.<code>`).

**CG-ERR-05 · The client handles the four error families the same way everywhere.** 🔒 AD-FORM-04 · AD-AUTH-01 · AD-NET-02 · AD-STATE-05\
The shared API client and form helper do it once: `errors[]` → field messages under the fields; a non-field problem → inline alert at the top of the form (never only a toast); 401 → login with the revoke reason and return to the page; network failure or timeout on a money action → "checking whether it was saved" (CG-IDEM-04). Every error screen shows the `request_id`.\
*Why:* each screen inventing its own handling is how "slot just taken" ends up as a toast nobody saw.\
*Enforced by:* Both — CI: e2e tests for the cases above in the flows of CG-TEST-06; Review.

**CG-ERR-06 · Calls to the outside have a timeout, fail closed, and are retried only when repeating is safe.** 🔒 system design §3.5 · ADR-002\
External calls (mail, captcha, Google, bucket) time out after 5 s. Captcha or permission verification that cannot be completed is a refusal, never a pass. Automatic retries exist only for idempotent work: pg-boss jobs (3× with backoff), GETs, and money POSTs with the **same** `Idempotency-Key`. A job handler throws on failure — it does not catch and report success.\
*Why:* "captcha is down, let the booking through" is an open door for the first bot that finds it.\
*Enforced by:* Both — CI: tests with the fakes of CG-ARCH-08 (timeout → the stated error); Review.

---

## 11. Security (OWASP ASVS 5.0 as implemented here)

**CG-SEC-01 · Authentication, sessions and CSRF are exactly ADR-005 — no JWT, no session credential in web storage.** 🔒 ADR-005 · D-AUTH-06 · API-AUTH-01 · API-AUTH-02\
Login is passwordless (Google OIDC or e-mail OTP). The session is an opaque random id in the `point_session` cookie (`HttpOnly; Secure; SameSite=Lax`, host-only), stored hashed; every request re-checks the session, the user status and the employee status. Every mutating staff request carries `X-Requested-With: point-app` and an `Origin` equal to the app host; the Socket.IO handshake checks cookie + `Origin` + `auth.client`. A JWT library is used only to verify Google's ID token inside the auth module. (Overrides the common "JWT access + refresh token" pattern — it cannot revoke instantly.)\
*Why:* "employee resigned → locked out on the next request" is a locked decision; a stateless token cannot do it.\
*Enforced by:* CI — integration tests (revoked session → 401, inactive employee → 401, missing header → 403 `csrf`, foreign `Origin` → 403 — ADR-005 action item 4) · `no-restricted-imports` (`jsonwebtoken`, `jose`, `@nestjs/jwt`, `passport*` outside `modules/auth`) · `no-restricted-globals` (`localStorage`, `sessionStorage` outside the one typed browser-storage helper, whose key list holds no credential — the booking manage token of ADR-004 is its only secret-like entry).

**CG-SEC-02 · Authorisation is decided on the server: permission AND scope — never a role name, never the UI.** 🔒 D-ROLE-03 · API-PERM-01 · API-PERM-03 · ADR-011 · ADR-012 · AD-PERM-01 · AD-META-06\
The guard resolves the caller's grant set and the target's data level; the resulting scope is passed **explicitly** into every repository read (`scope` is a required argument with no default). Lists are scope-filtered, a single read out of scope answers 404, an action out of scope 403, a private target at branch scope 403 `company_scope_required`. Code never asks "is this a manager?" — only "does the caller hold this code for this branch?". Hiding a button is presentation, not protection.\
*Why:* roles are composed by the admin; a hard-coded `role.name === 'Manager'` breaks the day the owner renames or re-ticks a role.\
*Enforced by:* Both — CI: deny-path tests (CG-TEST-05) · `pnpm guards` (comparison against a role name); Review.

**CG-SEC-03 · Every input is validated at the boundary, with limits.** → see **CG-API-03** (one Zod schema per boundary, length and size limits, unknown members stripped, the Zawgyi and phone rules).

**CG-SEC-04 · Output is encoded for where it goes; nothing is built by string concatenation.** ⚠️ (ASVS V1 · ADR-013 · ADR-015)\
React renders text, never HTML: `dangerouslySetInnerHTML` is allowed only inside the one `JsonLd` component. Document templates HTML-escape every value (customer and item names are user input). SQL uses bind parameters (CG-DB-05). CSV / XLSX exports apply the formula-injection guard to text cells starting with `=`, `+`, `-`, `@`, TAB or CR. A user-supplied URL is rendered as a link only after an `https:` check. No `eval`, `new Function`, or shell command built from input.\
*Why:* a customer named `=HYPERLINK(...)` becomes a live formula in the owner's Excel export.\
*Enforced by:* CI — `react/no-danger` · `no-eval` · `no-implied-eval` · `no-new-func` · export tests with formula cells (ADR-015 action item 5).

**CG-SEC-05 · Secrets live only in the server environment and are validated at boot.** 🔒 ADR-009 · system design §4.1 + ⚠️ (12-Factor III)\
No secret, key, token, password or connection string is committed, logged, sent to the browser or pasted into an issue, a PR or a prompt. `process.env` is read in one config module per app (`common/config` in the API), through a Zod schema that stops the boot on a missing or malformed variable; `.env` files are git-ignored and `.env.example` lists every variable without values. Only non-secret values are `NEXT_PUBLIC_*`. `INTERNAL_OPS_KEY` is never in the web container. A leaked secret is rotated (runbook), not just removed from history.\
*Why:* a committed bucket key exposes every receipt and staff document to every account and every clone that can read the repository — and it stays in the history.\
*Enforced by:* CI — `gitleaks` (pre-commit hook and pipeline) · `n/no-process-env` outside the config modules · `pnpm guards` (`check-env-example.mjs` — `.env.example` and the env schemas list the same keys).

**CG-SEC-06 · Tokens come from a CSPRNG, are stored as hashes and never appear in logs.** 🔒 API-AUTH-01 · API-IDEM-03 · P3-RULE-10 · P5-RULE-17\
Session ids, OTP codes, booking manage tokens, attendance QR tokens and hand-off verifiers are generated with `crypto.randomBytes` / `crypto.getRandomValues`, stored as SHA-256 hashes where the design says so, and compared in constant time. Token-bearing paths and fields are redacted in Caddy, API and Sentry logs and in the audit interceptor. No home-made cryptography and no `Math.random()` for anything a person could guess.\
*Why:* the manage link is the only thing between a stranger and someone's booking.\
*Enforced by:* Both — CI: `pnpm guards` (`Math.random` in `apps/api` and `packages/shared`) · log-redaction test (CG-OBS-03); Review.

**CG-SEC-07 · Personal data is minimised by design.** 🔒 AD-PERM-05 · API-PUB-02 · ADR-012 (Amendment 1) · API-DATA-06\
Customer names and phones, staff phones and e-mails, salaries, commission figures, staff documents and attendance GPS points appear only in the DTOs whose screen needs them, for callers whose grant covers them. Public DTOs never carry customer data or staff contact details; the masked phone is produced by the API. Private-level data is returned only through a company-scope grant and is never placed in a branch room, a log line or an error context.\
*Why:* a salary in a list DTO "because the admin screen needs it" is a salary every manager's browser can read.\
*Enforced by:* Both — CI: response-schema tests per level (ADR-012 action item 8); Review against the "never" list.

**CG-SEC-08 · Files are checked by content and enter only through the attachments module.** 🔒 ADR-014 · API-LIM-03 · P8-RULE-03\
Uploads go through `POST /v1/attachments`: size limit from `system.upload_max_mb`, type by magic bytes (never extension or `Content-Type`), images re-encoded with EXIF / GPS removed, staging row → `Attachments.link` in the business transaction. No module writes to the bucket or builds a bucket URL itself; private files are served by 5-minute presigned URLs after the owning entity's read check; no signed URL is ever stored.\
*Why:* a photo's EXIF block carries the employee's home coordinates.\
*Enforced by:* CI — tests of ADR-014 action item 6 (spoofed extension refused, EXIF gone) · `no-restricted-imports` (the S3 client outside the storage service).

**CG-SEC-09 · Every public endpoint has a rate limit; captcha is verified on the server and fails closed.** 🔒 API-LIM-01 · API-LIM-02 · API-LIM-03\
A new `/v1/public` endpoint declares its limit class in code (booking create, availability, media, default) and is not merged without one. Turnstile tokens are verified server-side; OTP limits and the lock after 5 failures are enforced in the API, not the form. Staff requests are capped per session, not per IP.\
*Why:* the public booking form is the one door open to the whole internet.\
*Enforced by:* Both — CI: a test that enumerates `@Public()` handlers and fails when one has no limit class; Review.

**CG-SEC-10 · Every action is audited by the interceptor; the audit never contains a secret.** 🔒 API-AUD-01 · D-AUD-01 · D-AUD-02\
Action endpoints get their `audit_events` row from the audit interceptor (action, reason, branch per the one rule of API-AUD-01); money tables are also recorded by the DB triggers. Nobody writes audit rows by hand, updates them or deletes them. Token and code hashes, QR tokens, `manage_token`, `captcha_token` and file contents are removed before the row is written.\
*Why:* the audit log is what the owner reads when cash is short — and it is readable by managers, so it must not hold a key.\
*Enforced by:* CI — integration tests (an action endpoint without an audit row fails; redaction of the listed fields).

**CG-SEC-11 · No real data outside production — the repositories are private and still hold nothing that would harm if they leaked.** 🔒 ADR-016 (Decision 8) · D-ARC-03 + ⚠️ (`spec-fixtures.md`)\
Both repositories are private. Fixtures, seeds, tests, screenshots, issues, PRs, commit messages and prompts still use only the invented people of `spec-fixtures.md` (`@point.test` addresses, fixture phone numbers and KBZPay references). No production dump is copied to a laptop, to CI or into a repository; debugging production data happens on the server, read-only, by the lead developer. Server addresses, bucket names and account e-mails stay out of the repos. A file above 1 MB that is not a font, a design-reference image or a `db/source/` file needs a reason in the PR.\
*Why:* a screenshot with a real customer's phone number in a pull request is a disclosure that cannot be taken back, whoever can see the repository today.\
*Enforced by:* Both — CI: `gitleaks` + `pnpm guards` (e-mail addresses outside `.test` / `example.com` in fixtures and tests; file-size limit); Review of every screenshot.

**CG-SEC-12 · Three surfaces, one origin, no CORS.** 🔒 ADR-009 · API-SHAPE-01 · API-SHAPE-02 · ADR-013\
Staff, public and internal endpoints live in separate controllers with their own guards. CORS middleware is not registered. `/v1/internal/*` accepts only `INTERNAL_OPS_KEY`; `INTERNAL_SSR_KEY` only lifts the public rate limit. Security headers and the CSP are set at Caddy — a new external host (script, image, connect) needs a CSP change and an ADR. The API calls out only to configured hosts; the document renderer has no network at all.\
*Why:* each new origin or header exception is a hole in the one protection (same origin) that keeps the staff cookie safe.\
*Enforced by:* CI — edge tests of ADR-009 action items 1 and 4 (`e2e/edge.spec.ts`) · a unit test that the bootstrap registers no CORS.

---

## 12. Idempotency and concurrency for money endpoints

**CG-IDEM-01 · Row-creating money endpoints require `Idempotency-Key`.** 🔒 API-IDEM-01 · D-VIS-10\
The endpoints listed in API-IDEM-01 (START, product-only sale, difference sale, payments, refunds, receivables and repayments, stock usage and adjustments, cash outs and returns, expenses, manual incomes) carry `@Idempotent()`; a request without the header answers 400 `idempotency_key_required`. No other endpoint asks for a key.\
*Why:* on 4G the reply is lost more often than the request — without the key, "retry" means "charge twice".\
*Enforced by:* CI — contract test: every operation whose OpenAPI contract requires the header refuses a request without it, and no other operation does.

**CG-IDEM-02 · The key is stored in the row; a replay returns the same resource.** 🔒 API-IDEM-02 · API-IDEM-03 · D-DB-12 · ADR-004\
The key is the row's `client_request_id` (unique index) — there is no generic idempotency table. Same key, first request finished → **200** with the same resource and `Idempotent-Replayed: true`; still running → 409 `idempotency_in_progress`; same key with different identifying fields → 422 `idempotency_mismatch`. Booking create uses the client-generated manage token the same way. A second request with the same key does not wait: it finds the key's advisory lock taken and answers 409, and its retry replays. A unique violation on the index is only the last line behind that lock and also answers 409 (CG-DB-12).\
*Why:* the row itself is the proof that the money was recorded once.
```ts
// expenses.service.ts — P7.EXP.03; identifying fields: branch_id, category_id, amount, expense_date
create(key: string, body: CreateExpenseBody) {
  const input = toCreateExpense(body);                   // wire → domain: amount becomes Mmk (CG-MONEY-02)
  return this.db.run((tx) =>                             // the service opens the transaction (CG-DB-03)
    this.idempotency.run(tx, {                           // first statement: the key's advisory lock
      key,
      find: () => this.expenses.findByClientRequestId(tx, key),
      same: (row) =>
        row.branch_id === input.branch_id && row.category_id === input.category_id &&
        row.amount === input.amount && row.expense_date === input.expense_date,
      create: () => this.insertAndAudit(tx, key, input),  // the insert, then Audit.emit(…); a replay calls Audit.skip()
    }),
  );  // replay → 200 + Idempotent-Replayed · still running → 409 · different fields → 422
}
```
*Enforced by:* CI — integration tests per endpoint: replay → 200 + header, mismatch → 422, one row in the table.

**CG-IDEM-03 · Actions on existing rows are idempotent by state.** 🔒 API-IDEM-01 · API-IDEM-02\
FINISH, COMPLETE, post, send / receive, close, finalize, publish, mark paid, approve / reject, verify, cancel: lock the row `FOR UPDATE`, then — already in the target state → **200** with the current resource and no second effect; state moved elsewhere → 409 `invalid_transition`. Exceptions are only the ones a part names (day reopen).\
*Why:* a double-tapped Finish must give one receipt number, not two.\
*Enforced by:* CI — integration test per action: called twice → one effect, second answer 200.

**CG-IDEM-04 · The client creates one key per logical submit and never guesses.** 🔒 AD-NET-01 · AD-NET-02 · ADR-004\
All money mutations use the shared hook: it creates the UUID when the user starts the action, reuses it for every retry of that submit, and creates a new one only for a new user action. The submit button is disabled while the request is in flight. After ~15 s without an answer the UI says "checking whether it was saved", looks the record up (`GET /v1/me/requests/{client_request_id}` — P4.REQ.01) and only then offers Retry — with the same key. TanStack Query's automatic retry is off for mutations.\
*Why:* a new key on retry is, to the server, a second payment.
```tsx
const addPayment = useIdempotentMutation({
  mutationFn: (body: AddPaymentBody, idempotencyKey) => api.sales.addPayment(saleId, body, { idempotencyKey }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: saleKeys.detail(saleId) }),
});
```
*Enforced by:* Both — CI: e2e test "the reply to a payment is lost → still one payment"; Review (a row-creating money call that does not use the shared hook).

**CG-IDEM-05 · Concurrency is tested, not assumed; a deadlock is a defect.** ⚠️ (API-IDEM-05 · API-IDEM-06)\
Each row-creating money endpoint has an integration test that fires the same request five times in parallel with one key and finds exactly one row. Each race a spec names (payment during day close, START against the no-show auto-cancel, two bookings for one slot) has its own test against the real database. There is no blanket retry loop around transactions: a `40P01` means the lock order was broken and is fixed in code.\
*Why:* "it works when I click once" says nothing about two phones and a retrying network.\
*Enforced by:* CI — the integration tests above.

---

## 13. Web app — React and Next.js

**CG-UI-01 · Two route trees that never import each other.** 🔒 ADR-001 · ADR-009 · API-META-04\
`app/site/` (public website and booking modal, host `<domain>`) and `app/staff/` (staff PWA, host `app.<domain>`) are reached only through the host rewrite in `proxy.ts`; a direct request to `/site/*` or `/staff/*` answers 404. Feature code is not shared between the trees — what both need lives in `packages/ui`, `packages/shared` or `packages/i18n`.\
*Why:* a staff component imported into the public bundle ships admin code — and maybe a staff DTO — to every visitor.\
*Enforced by:* CI — `import-x/no-restricted-paths` (`app/site/**` and its feature components ↔ `app/staff/**` and its feature components).

**CG-UI-02 · Server Components on the site, a client app for staff.** 🔒 ADR-006 · AD-IMPL-01 · FE-IMPL-01\
`site/`: pages and layouts are Server Components that load data through cached loaders (tags `site`, `home`, `branch:<code>`, `barbers`, `services`, written against the pinned Next.js major); `'use client'` is placed on the interactive leaves only (booking modal steps, language switch, open-now status); availability and booking calls are never cached. Modules that hold a server secret import `server-only`. `staff/`: client components under one client layout, data through TanStack Query; no data fetching in `useEffect`.\
*Why:* a `'use client'` at the top of a site page ships the whole page as JavaScript to a phone on 4G.\
*Enforced by:* Both — CI: Lighthouse budgets (CG-PERF-01) · build error from `server-only`; Review.

**CG-UI-03 · All HTTP goes through the one typed API client.** 🔒 ADR-009 · API-AUTH-02 · API-AUD-02 · API-ERR-01\
Components and hooks never call `fetch` on `/api` directly. The shared client uses the relative base `/api/v1`, adds `X-Requested-With: point-app` and `X-Client`, attaches `Idempotency-Key` when given one, parses responses with the shared Zod schemas and turns `application/problem+json` into a typed `ProblemError`. No `axios`.\
*Why:* one forgotten CSRF header is a 403 that only appears in production; one unparsed response is an `any` in the checkout.\
*Enforced by:* CI — `no-restricted-globals` (`fetch` in the components and hooks of `apps/web` and in `packages/ui`) · `no-restricted-imports` (`axios`).

**CG-UI-04 · Shared components first; every shared component is in the `/dev/ui` catalogue.** 🔒 AD-IMPL-02 · AD-IMPL-06 · D-ENG-01\
A screen is built from `packages/ui` (`DataTable`, `MoneyInput`, `ReasonDialog`, `StatusBadge`, `PermissionGate` …). Raw `<button>`, `<input>`, `<select>`, `<textarea>` and shadcn / Radix primitives are used only inside `packages/ui`. A new or changed shared component gets a `/dev/ui` entry showing its states in Myanmar and English at 320 px and 1280 px. ⚠️ The catalogue answers 404 in a production build.\
*Why:* the second hand-made money input is the one that accepts a decimal point.\
*Enforced by:* Both — CI: `react/forbid-elements` and `no-restricted-imports` (`@radix-ui/*`) outside `packages/ui`; Review of the catalogue entry.

**CG-UI-05 · Tokens only — no invented colour, font or size.** 🔒 D-UX-02 · AD-VIS-01 · AD-VIS-03 · AD-IMPL-05\
Colours, fonts, spacing, radii, shadows and motion come from `packages/ui/tokens.css` through the Tailwind theme. No hex / `rgb()` / `hsl()` / `oklch()` value, no Tailwind palette class (`bg-blue-500`), no arbitrary colour value (`text-[#…]`), no `font-family` and no pixel font size outside the token file. The `site` tree overrides colour and font tokens in its own layer; the admin palette stays shadcn/ui `neutral` until the owner supplies one. A missing token is requested from the owner, never made up.\
*Why:* one orange button "to match the site" breaks the 4.5 : 1 contrast the owner's palette was checked against.\
*Enforced by:* CI — `tools/eslint/web.mjs` (colour literals, palette and arbitrary colour classes, `style` colours and `fontFamily`) · `pnpm guards` (`check-css.mjs`: colours and `font-family` in CSS outside `packages/ui/tokens.css`).

**CG-UI-06 · Forms are React Hook Form + the shared Zod schema.** 🔒 API-ERR-03 · D-UI-01 · AD-FORM-03 · AD-FORM-04\
`useForm({ resolver: zodResolver(sharedSchema), mode: 'onBlur' })`; errors re-validate on change; the submit button stays enabled and is disabled only while submitting. The shared `Form` / `Field` components render the label, the required mark and the message under the field from a language key. Server `errors[]` are applied with the shared helper; a non-field problem shows as an inline alert.\
*Why:* a second, hand-written validation in the form is the one that disagrees with the API.
```tsx
const form = useForm({ resolver: zodResolver(createExpenseSchema), mode: 'onBlur' });
const save = useIdempotentMutation({
  mutationFn: (body: CreateExpenseBody, idempotencyKey) => api.expenses.create(body, { idempotencyKey }),
  onError: (error) => applyProblemToForm(error, form),
});
```
*Enforced by:* Both — CI: `no-restricted-imports` (`formik`, `yup`, `joi`); Review.

**CG-UI-07 · Server state lives in TanStack Query: key factories, invalidation by event, fresh money.** 🔒 AD-PERF-03 · ADR-008 · AD-RT-01 · AD-LIST-05\
Query keys come from one key factory per module — never an inline array. Server data is not copied into `useState` or a global store; list filters live in the URL. Reference data (services, prices, employees, settings, reasons) is cached and invalidated by realtime events; money and status data uses `staleTime: 0`, refetches on focus and reconnect and after every mutation. A realtime event maps to keys in one table inside `useRealtime()`. A query key and a URL filter are JSON: they carry an amount as the wire number, never as `Mmk` (`JSON.stringify` throws on a `bigint`).\
*Why:* a stale "unpaid" badge on the Today list sends a customer away without paying — or asks for payment twice.
```ts
export const saleKeys = {
  all: ['sales'] as const,
  list: (filters: SaleListFilters) => [...saleKeys.all, 'list', filters] as const,
  detail: (id: string) => [...saleKeys.all, 'detail', id] as const,
};
```
*Enforced by:* CI — `@tanstack/eslint-plugin-query` (recommended rules) · `no-restricted-syntax` (an array literal as `queryKey` outside `*.keys.ts`) · `no-restricted-imports` (`redux`, `zustand`, `jotai`, `swr`).

**CG-UI-08 · Nothing about money or status is shown as done before the server says so.** 🔒 AD-PERF-04 · AD-GOAL-03\
No optimistic update for a money action or a status transition; the amount is shown before the commit and the success state only after the 2xx answer. Optimistic updates are limited to trivial, reversible UI state (notification read, panel collapsed, column settings).\
*Why:* a green "Paid" that rolls back a second later is a customer who has already left.\
*Enforced by:* Both — CI: `no-restricted-syntax` (`onMutate` outside the allowlisted files); Review.

**CG-UI-09 · Visibility comes from `can()`, labels and tones from the status map, features from capability flags.** 🔒 AD-PERM-02 · AD-PERM-03 · AD-CMP-05 · AD-IMPL-04 · AD-PWA-02\
Controls are hidden or disabled through `can(code, { branchId?, level? })` / `PermissionGate`, built from `/v1/me` — never from a role name, and no enabled control may answer 403. A status is rendered by `StatusBadge` from the one tone map with the label `status.<table>.<CONST>`. Print, scan and similar features are switched by shell capability flags, never by user-agent sniffing.\
*Why:* the same status in two colours on two screens is how staff stop trusting either.\
*Enforced by:* Both — CI: `pnpm guards` (`navigator.userAgent`) · CG-TS-04 lint · e2e deny-path smoke; Review.

**CG-UI-10 · Every screen has its states and meets WCAG 2.1 AA.** 🔒 AD-QA-01 · AD-A11Y-01 · FE-A11Y-01 · FE-QA-01\
Loading (skeleton, not a blank spinner), empty, error, forbidden, read-only (lock) and offline states exist where they apply. Inputs have visible labels, icon buttons an `aria-label`, targets are ≥ 44 px, focus is visible, `lang` is set, reduced motion is honoured, zoom is not disabled. A screen is checked in Myanmar and English at 320, 360, 768 and 1280 px before review.\
*Why:* Myanmar text is longer and taller — a screen checked only in English clips on the barber's phone.\
*Enforced by:* Both — CI: `eslint-plugin-jsx-a11y` · `@axe-core/playwright` on the catalogue and the flow pages · `pnpm guards` (`user-scalable=no`); Review of the MM / EN screenshots at 360 px (CG-GIT-04).

---

## 14. Language and formatting

**CG-I18N-01 · No hard-coded UI string.** 🔒 D-PLT-03 · AD-L10N-01 · AD-IMPL-05 · API-ERR-01 · AD-FORM-04\
Every string a person can see or hear — labels, buttons, placeholders, `aria-label`, `alt`, `title`, toasts, validation and error messages, empty states, status and permission labels, notification templates — comes from the `my` and `en` language files through `next-intl`. An API problem's `title` and `detail` are English developer strings and are never rendered: the client shows `error.<code>` with the problem's `params` through the shared error helper. Text rendered by the server follows CG-I18N-05.\
*Why:* a string typed into JSX exists in one language only, and an English exception message on a Myanmar screen is the fastest way to lose a barber's trust in the app.\
*Enforced by:* Both — CI: the raw-JSX-string rule of `tools/eslint/web.mjs` (text and `aria-label`, `placeholder`, `title`, `alt`) · `pnpm i18n:check`; Review (no component reads `problem.detail`).

**CG-I18N-02 · Keys are typed, complete in both languages, and whole sentences.** 🔒 AD-L10N-02 + ⚠️\
Key pattern `<module>.<screen>.<element>`; shared families `common.*`, `status.<table>.<CONSTANT>`, `permission.<code>`, `settings.<key>.label|help`, `reason.<code>`, `error.<code>`, `notification.<template_key>`. Keys are typed from the `en` file so an unknown key is a compile error. Both languages change in the same PR and have the same key set; unused keys are removed. A sentence is one message with ICU parameters — never glued from translated fragments. Wording comes from the spec and the glossary; new Myanmar wording is read by a Myanmar speaker before merge and is never machine-made filler.\
*Why:* "Paid " + amount + " by " + name cannot be put into Myanmar word order.\
*Enforced by:* Both — CI: `tsc` (typed keys) · `pnpm i18n:check` (same key set in `my` and `en`, no empty value, every status constant and error code has its key); Review of Myanmar text.

**CG-I18N-03 · One formatter for money, dates, times, phones and quantities.** 🔒 AD-FMT-00 · D-PLT-04 · D-PLT-05 · FE-FMT-01 · AD-FMT-10\
Display goes through `formatMoney`, `formatDate`, `formatTime`, `formatDateTime`, `formatDuration`, `formatPhone`, `formatPercent`, `formatQty` in `packages/shared`: `7,000 Ks` / `7,000 ကျပ်` in the app (profile `app`), `7,000 Ks` in both languages on the website (profile `site`), `05/Oct/2026`, `2:30 PM`, digits 0–9 in both languages. Inputs accept ၀–၉ and normalise to 0–9. Receipts, exports and e-mails use the same functions.\
*Why:* one screen with `7000`, one with `7,000 Ks` and one with `၇,၀၀၀` is how a zero gets lost.\
*Enforced by:* CI — the `toLocaleString` / `Intl.*` ban of CG-TIME-06 · unit tests of the formatter.

**CG-I18N-04 · Bilingual data and Myanmar text are handled by the shared helpers.** 🔒 D-DB-04 · API-DATA-05 · AD-L10N-03 · AD-L10N-07 · API-SHAPE-05\
`*_mm` is required, `*_en` optional; display uses the one fallback helper (EN UI → `*_en`, else `*_mm`). Text is Unicode: the client converts Zawgyi input, the API rejects it. Myanmar strings are never cut with `slice` / `substring` or measured with `length` for layout — use CSS clamping; sorting and search follow the shared helper.\
*Why:* cutting a Myanmar string in the middle of a stacked consonant prints an unreadable name on a receipt.\
*Enforced by:* Both — CI: unit tests of the helpers; golden-image tests of documents with stacked Myanmar text (ADR-013 action item 5); Review.

**CG-I18N-05 · Text rendered by the server follows the locked language rule, not the request header.** 🔒 D-PLT-03 · AD-RCPT-01 · API-AUD-02 · ADR-013\
Receipts are always English. OTP and invite e-mails and payslips use the user's `ui_language`, then the system default. API errors carry codes, not sentences (CG-I18N-01). Templates in `packages/documents` take their strings from the same language files.\
*Why:* a reprint must be identical to the first print — it cannot depend on who presses the button.\
*Enforced by:* CI — golden tests for receipts and payslips (ADR-013 action item 5).

---

## 15. Tests

**CG-TEST-01 · The pyramid for this system.** 🔒 D-ENG-02 (test pyramid) · D-ENG-01 (Vitest · real PostgreSQL 16 · Playwright)\
**Unit** (Vitest, milliseconds, no database / network / clock) — the many: pure money, date, availability and permission rules. **Integration** (Vitest against PostgreSQL 16 with the real migrations) — every endpoint with its guards, constraints, locks, idempotency and audit. **End-to-end** (Playwright) — the few: only the flows of AD-QA-03 and FE-QA-02. A check is written at the lowest level that can prove it; the `docs/db/*-test.sql` constraint tests run beside them.\
*Why:* a unit-only suite never meets the exclusion constraint; an e2e-heavy suite takes twenty minutes and gets skipped.\
*Enforced by:* Both — CI: separate jobs `unit` (`pnpm test`), `integration` (`pnpm test:int`), `e2e` (`pnpm e2e`) and `db` (`pnpm db:test`); Review (the level a new test is written at).

**CG-TEST-02 · Business rules are pure functions with table-driven unit tests.** ⚠️ (system design §3.6 · review §5.6)\
Commission tiers, sale totals and discount split, proration, deductions, allocation, availability, business date, receipt-number format, formatters, phone normalisation and grant resolution are `*.rule.ts` functions of their inputs (data, settings, `now`) — no database, no clock, no injection container. Their tests are tables of cases using the fixture numbers and the worked examples of the API parts, including the boundaries (at the limit, just outside it).\
*Why:* "2,250,000 at 15 % and the rest at 20 %" must be provable in a millisecond, by hand, from the test table.\
*Enforced by:* Both — CI: `import-x/no-restricted-paths` (`*.rule.ts` imports only `packages/shared`) + coverage floor (CG-TEST-10); Review.

**CG-TEST-03 · Tests first for money, permission and date-boundary rules; a bug fix starts with a failing test.** 🔒 `openspec/config.yaml` (tasks rule) · review §5.6\
For those three kinds of rule the failing tests are written from the spec scenarios before the implementation, and the PR shows it (the test commit precedes or accompanies the code). Claude Code works the same way: it writes the tests from the scenarios, runs them and shows them failing, then implements until they pass — and it never edits a test to fit its implementation; a scenario that looks wrong is CG-META-04. Every bug fix adds the test that fails without the fix.\
*Why:* a test written after the code tests what the code does; a test written from the scenario tests what the owner decided.\
*Enforced by:* Review (test-first is visible in the commit order).

**CG-TEST-04 · Integration tests run against a real PostgreSQL 16 with the real migrations.** 🔒 D-ENG-01 · ADR-014 (action item 5) + ⚠️\
No mocked Prisma, no SQLite, no in-memory Postgres substitute. Each Vitest worker gets its own database cloned from a migrated template and connects as `point_app`; tables are truncated between tests (tests that prove locks need real commits, so no rollback wrapper). Requests go through the real Nest application — guards, pipes, interceptors, filter; endpoints that exist only for a test live in `apps/api/test/fixtures/` and never in `AppModule`. The bucket is the local S3-compatible server and mail is Mailpit, as in the development Compose file; other outside services use the fakes of CG-ARCH-08.\
*Why:* the rules that protect money live in constraints, triggers and locks — a mock has none of them.\
*Enforced by:* CI — job `integration` with a `postgres:16` service; `no-restricted-imports` (`pg-mem`, `sqlite*`, Prisma mock libraries).

**CG-TEST-05 · Every endpoint has an allow test and its deny tests.** 🔒 ADR-011 (action item 6) · ADR-012 (action items 5 and 8) · API-PERM-03\
For each endpoint: the permitted caller passes; a caller without the code gets 403; the code without scope over the target gets 404 (single read), an empty page (list) or 403 (action); a company-master write at branch scope gets 403 `company_scope_required`; a private target at branch scope gets 403 — lists included; the own-record rule passes for the owner only. The callers are the fixture people (U Kyaw Zin — Admin, company; Ma Hnin — Manager B3; Ko Zaw — Manager B1; Ko Aung — Barber B3).\
*Why:* every permission bug found in production is a deny path nobody wrote a test for.\
*Enforced by:* CI — a completeness test lists the routes of the application and fails for any endpoint without registered access tests.

**CG-TEST-06 · End-to-end tests cover the named flows, in both languages, at phone and desktop size.** 🔒 AD-QA-03 · FE-QA-02 · AD-A11Y-01 · FE-QA-05 · D-ENG-01 (test login) · `spec-fixtures.md` §7\
Playwright runs the flows of AD-QA-03 (staff) and FE-QA-02 (site) at 360 × 800 and 1280 × 800, with a Myanmar and an English smoke run. Login is the real e-mail OTP read from Mailpit's API — no password, no test-only login endpoint. Elements are found by role, label or test id, never by translated text. Each flow page gets an axe check; the site routes get the Lighthouse budgets.\
*Why:* the flows are the product; a backdoor login would test a system that does not ship.\
*Enforced by:* CI — job `e2e` (Playwright + `@axe-core/playwright`) · Lighthouse CI.

**CG-TEST-07 · Every spec scenario has a test that carries its name.** 🔒 D-PLT-17 · D-PLT-20 · `openspec/config.yaml`\
For the change a PR implements, each `#### Scenario:` of the tasks done has at least one automated test titled with the scenario name, inside `describe('<change-id> · <capability> · <requirement name>')` — or is listed in the PR as covered only by the manual workbook, with the reason. A test that maps to no scenario says why in its title (a regression, a technical guarantee).\
*Why:* the test workbook, the spec and the code can only be compared if they use the same names.
```ts
// names are copied from the spec file — the two below only show the pattern
describe('add-walkin-visit-checkout · payments · Split payment must equal the total', () => {
  it('Scenario: Cash 5,000 + KBZPay 6,000 pays 11,000 in full', async () => { /* … */ });
});
```
*Enforced by:* CI — `spec:trace <change-id>` (reads the change in `../point-sdd`, fails on a scenario with neither a test nor a manual-only note). Until the pipeline can read `point-sdd` (OPEN-CG-04) it runs on the developer's machine in the verification group, and its output is pasted into the PR.

**CG-TEST-08 · Test data is `spec-fixtures.md`.** 🔒 D-PLT-20 · `docs/plan/spec-fixtures.md`\
Tests, the fixture seed and screenshots use the fixture company, branches (B1, B2, B3), people, services, prices (Haircut at B3 = 8,000; Ko Aung's = 10,000), references, devices and dates ("today" = Monday 05/Oct/2026). The fixture seed adds test data only — system rows the design calls seeds (payment methods, seed roles, the permission catalogue, the company row) come from the base seed of every environment. Builders are named after the fixture (`fx.koAung()`, `fx.branchB3()`). A fixture value is never changed — rows are added. Random data appears only in property-based tests, with a logged seed.\
*Why:* a tester checks a number on the screen against the spec without calculating; that works only if the test used the same 11,000.\
*Enforced by:* Both — CI: the seed script and the builders import one fixture module, which has a test against the values above; Review.

**CG-TEST-09 · Tests are deterministic.** ⚠️\
No sleeps or fixed waits, no real clock (the fake clock, Playwright's clock), no dependence on test order or on another test's data, no call to a third-party service, no shared mutable module state. `.only` and `.skip` are not committed. A flaky test is fixed, or quarantined with an issue, within one working day — never left to "retry until green" (e2e retries: 1 in CI, and a pass-on-retry is reported).\
*Why:* a suite that fails at random teaches the team to ignore red, and then a real money bug is ignored too.\
*Enforced by:* CI — `vitest/no-focused-tests` · `vitest/no-disabled-tests` · `playwright/no-wait-for-timeout` · `playwright/no-focused-test` · `playwright/no-skipped-test`.

**CG-TEST-10 · Coverage is risk-based, with a floor where money and access are decided.** ⚠️ (OPEN-CG-03)\
There is no global percentage target. Floors, measured by Vitest (v8 provider) and failing CI below them: **95 % lines and 90 % branches** for `packages/shared/src/money`, `packages/shared/src/time` and every `*.rule.ts`; **90 % lines and 85 % branches** for the guards, the grant / scope resolution and the services of the money modules (`sales`, `cash-closing`, `finance`, `commission`, `payroll`, `inventory`), unit and integration combined. Beyond the numbers: every constraint and trigger of `docs/db` has a test, every error code a scenario names is produced by a test, and every lock a design.md lists has a race test.\
*Why:* 80 % everywhere is reached by testing the easy code; the floor points the effort at the code that can lose money.\
*Enforced by:* CI — Vitest `coverage.thresholds` per path.

---

## 16. Git and pull requests

**CG-GIT-01 · One branch per change, no direct push to `main`.** 🔒 D-ENG-01 · `docs/SDD-Workflow-Guide-MM.md` §5\
Work happens on `feature/<change-id>` (the OpenSpec change id — `add-…`, `change-…`, `remove-…`, `fix-…`); a change delivered in several pull requests uses one branch per pull request, `feature/<change-id>/<part>` (for example `feature/add-repo-scaffold/db`); tooling, dependency and documentation work with no behaviour change uses `chore/<topic>`. `main` is protected: pull request only, required checks, one approval, no force push — on a private repository GitHub enforces this only on a paid plan (OPEN-CG-06); until it is in place the two developers keep the same rules by hand. A branch lives days, not weeks, and is rebased on `main` at least daily.\
*Why:* two developers on long branches discover their migration conflict on the last day of the month.\
*Enforced by:* CI — job `pr-title` (`check-branch-name.mjs`) · GitHub branch protection (OPEN-CG-06).

**CG-GIT-02 · Conventional Commits, with the change id as the scope and the IDs in a trailer.** 🔒 D-ENG-01 · Conventional Commits 1.0.0 · `openspec/config.yaml` (apply guidance)\
`<type>(<change-id>): <imperative summary ≤ 72 chars>`; types `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `perf`. The body says why; a `Refs:` trailer lists the decision, endpoint, UX and CG IDs. About one commit per task group, and every commit builds; work-in-progress commits on the branch need only a valid Conventional Commit header. The PR title has the full form — it becomes the squash commit, with the `Refs:` trailer taken from the PR description.
```text
feat(add-walkin-visit-checkout): take split payment cash + KBZPay

Refs: D-PAY-01, P4.PAY.02, AD-POS-08, CG-IDEM-01, CG-MONEY-06
```
*Why:* `git log --grep add-walkin-visit-checkout` must show everything that change did.\
*Enforced by:* CI — job `pr-title` (`tools/guards/check-pr-title.mjs`: Conventional Commit; scope = a change id `^(add|change|remove|fix)-[a-z0-9-]+$`, or `repo` / `deps` on a `chore/` branch) · the local `commit-msg` hook (header only).

**CG-GIT-03 · Pull requests are small and do one thing.** 🔒 D-ENG-01 · D-PLT-20\
A change of 1–3 days is one to three PRs; the four wave-0 changes (`add-repo-scaffold`, `add-shared-ui-components`, `add-foundation-auth-access`, `add-walkin-visit-checkout`) are larger and merge **one PR per task group**. Aim for ≤ 400 changed hand-written lines. Not counted: generated files, lockfiles, the baseline migration and `db/source/`, language files and test fixtures. A PR never mixes a feature with a refactor, a reformat or a dependency update.\
*Why:* nobody reviews line 900 of a diff as carefully as line 90 — and that is where the missing scope filter is.\
*Enforced by:* Both — CI: a size check comments above 400 counted lines and fails above 800 (`add-ci-guard-rails`); Review.

**CG-GIT-04 · The PR description follows the template.** 🔒 `openspec/config.yaml` (apply guidance) · AD-QA-01 · FE-QA-01 + ⚠️\
Every PR fills in the sections below; an empty section says "n/a — why".
```markdown
## Change
Spec: point-sdd/openspec/changes/<change-id>   ·   Tasks done: 2.1–2.4

## Implements
Decisions: D-…   ·   API: P4.… / P4-RULE-…   ·   UX: AD-… / FE-…   ·   ADR: ADR-…   ·   Rules: CG-…

## What changed and why
(3–6 lines; anything the spec did not say → link to the open question in point-sdd)

## Test evidence
- [ ] unit  - [ ] integration  - [ ] e2e
- [ ] spec:trace clean (or scenarios left to the workbook: …)  - [ ] openapi:check clean   (both run locally until CI can read point-sdd)
New tests: …   ·   Race / boundary cases covered: …
Workbook (last PR of the change): cases …   ·   OK …   ·   NG open: 0

## Screenshots (UI changes) — Myanmar and English at 360 px (desktop screens also at 1280 px), fixture data only

## Database
Migration: yes / no   ·   additive: yes   ·   docs/db version: …

## Passes
- [ ] "What can we remove?" (CG-REVIEW-03)
- [ ] Security pass — required for money / permission / auth / migration changes (CG-REVIEW-04)
- [ ] No new lint exemption (or: `cg-exception CG-…` with the reason above)
- [ ] Runbook, `.env.example`, `VERSIONS.md` updated (or n/a)
```
*Why:* the reviewer's first question is "which decision is this?" — the template answers it before it is asked.\
*Enforced by:* Both — CI: a PR check fails on a missing section or a missing change id (`add-ci-guard-rails`); Review.

**CG-GIT-05 · Merge = squash, after green CI, one human approval and a clean test workbook.** 🔒 D-ENG-01 · `docs/SDD-Workflow-Guide-MM.md` (step order)\
The order for a change is: apply → CI green + review → test cases (`/point-generate-tests`) → test (the workbook, by hand or with `/point-browser-tester`) against the feature branch's environment → NG fixed on the branch → squash merge → archive. The only merge method is squash; the branch is deleted afterwards. Before any merge: the CI jobs `static` (format, lint, typecheck, guards), `unit`, `db`, `integration`, `images`, `e2e` and `pr-title` are green — each check of §24 from the day it exists; one approving review by the other developer; conversations resolved; branch up to date with `main`. When a change is split into several PRs, the earlier parts merge on CI + review; the **last** PR stays open while the test cases are generated and run on its branch, takes the NG fixes as commits, and merges when no NG is open. Then the change is archived in `point-sdd`. No `--no-verify`, no skipped job, no admin bypass.\
*Why:* a red check that is "known to be flaky" is how the one real failure gets merged; an NG found after the merge costs a second PR and a second review for the same change.\
*Enforced by:* Both — CI: GitHub branch protection (required checks, squash only, 1 approval — OPEN-CG-06); Review (the workbook result in the last PR).

**CG-GIT-06 · What never enters the repository.** → see **CG-SEC-05** (secrets and `.env` files) and **CG-SEC-11** (real data, dumps, large files); build output, coverage reports, test traces and generated clients stay out through `.gitignore`.

---

## 17. Code review

**CG-REVIEW-01 · Every PR is approved by the other developer.** 🔒 D-ENG-01 (PR with 1 review)\
The author never approves their own PR, and a review by Claude Code or another tool may come first but does not count as the approval. The reviewer answers within one working day. Comments cite the rule (`CG-DB-07: visit is locked before sale`); `nit:` marks a non-blocking remark; disagreement on a 🔒 rule is not settled in the PR (CG-META-01).\
*Why:* with two developers, the review is the only second pair of eyes a money rule ever gets.\
*Enforced by:* CI — GitHub branch protection (1 approval, not the author — OPEN-CG-06).

**CG-REVIEW-02 · The reviewer's checklist, in this order.** ⚠️
1. **Spec** — the change id exists; the diff does what the tasks say and nothing more; no behaviour the spec does not state (CG-META-03 / 04).
2. **Money, time, access** — integer money through the money module, server totals, rounding with a rule ID; clock and `businessDateOf`; one decorator with the right level; scope passed to every query.
3. **Writes** — transaction runner, lock order, checks after locks, idempotency by key or state, no network inside the transaction, no hard delete, additive migration.
4. **Tests** — scenario names present; boundaries and deny paths; race tests where the design lists locks; no sleeps; fixture data.
5. **Boundaries** — module imports through `index.ts`; no Prisma outside repositories; DTO mapped field by field; public DTO separate.
6. **Screen** — shared components, tokens, both languages at 360 px, states, no enabled control that can 403.
7. **Errors and logs** — catalogue codes with both language keys; nothing swallowed; nothing sensitive logged.
8. **Docs** — runbook, `.env.example`, `VERSIONS.md`, ADR where needed; comments say why.

*Why:* an ordered list puts the expensive mistakes (spec, money, access) first, while the reviewer is fresh.\
*Enforced by:* Review.

**CG-REVIEW-03 · Every PR gets a "what can we remove?" pass.** 🔒 AD-QA-02 + ⚠️ (extended from screens to code)\
Before approving, the reviewer looks only for things to delete: fields, buttons, columns, text, options, parameters, abstractions with one user, dependencies, flags, dead code, comments that repeat the code. The author answers each suggestion with "removed" or the ID that requires it.\
*Why:* everything that is not required by a 🔒 decision is something the next developer has to keep working.\
*Enforced by:* Review — PR template checkbox.

**CG-REVIEW-04 · Money, permission, auth and migration changes get a security pass.** ⚠️ (OWASP Top 10:2025 A01 · A05 · ASVS V8)\
For a PR that touches a money module, a guard, `permissions.json`, the auth module or a migration of a money table, the reviewer checks and ticks: the decorator and level equal the API part's endpoint table · deny-path tests exist (CG-TEST-05) · every query takes the scope · idempotency and the parallel test (CG-IDEM-05) · lock order and checks after locks · audit row with reason and no secret · events carry ids only · DTOs and logs hold no private data · raw SQL is a tagged template · the migration is additive.\
*Why:* these ten checks are the ten ways this system can lose money or leak a salary.\
*Enforced by:* Both — CI: the PR check requires the ticked section when those paths changed; Review.

---

## 18. Logging and error tracking

**CG-OBS-01 · Logs are structured JSON on stdout, with four levels that mean something.** 🔒 ADR-007 #5\
`pino` through the injected logger; no `console.*`. `error` = a person must act (5xx, job dead letter, deadlock); `warn` = handled but unexpected (idempotency mismatch, rate limit hit, external timeout); `info` = one line per request (method, route template, status, duration, `request_id`, `user_id`, `branch_id`), one per job run, and money state transitions by id and code; `debug` = off in production. The message is a constant string; data goes in fields.\
*Why:* at this size the logs are the monitoring — a log nobody can filter is no log.\
*Enforced by:* CI — `no-console`.

**CG-OBS-02 · One request id ties everything together.** 🔒 API-ERR-01 · API-AUD-02\
The API generates a UUIDv7 per request (a client `X-Request-Id` is used only when it is a UUID) and carries it through `AsyncLocalStorage` into every log line, the `X-Request-Id` response header, the problem body, `app.request_id` (audit), the Sentry tag and the jobs that request enqueues. The error screen shows it.\
*Why:* "the barber read out 0199a3f2…" must be enough to find the log lines, the audit rows and the stack trace.\
*Enforced by:* CI — integration test (the same id in the header, the problem body, the audit row and the captured log line).

**CG-OBS-03 · What is never logged, traced or sent to Sentry.** 🔒 ADR-007 #3 · P3-RULE-10 · P5-RULE-17 · FE-SEC-02 · API-AUD-01\
Cookies and session ids; OTP codes; manage, QR and hand-off tokens and the URL paths that contain them; `X-Internal-Key`; captcha tokens; presigned URLs; request and response bodies; customer names and phones; staff phones and e-mails; salaries and other private-level figures; GPS coordinates. Logs identify things by id. The list lives once, in the logger's redaction config and the Sentry `beforeSend` hook.\
*Why:* logs are kept for days on a server and copied into tickets; a phone number written once is a phone number disclosed.\
*Enforced by:* CI — a canary test: after the integration suite, the captured logs and Sentry envelopes contain none of the fixture phones, tokens or OTP codes.

**CG-OBS-04 · Sentry gets defects, not business outcomes.** 🔒 ADR-007\
The SDK runs in the API, the web app and the Android shell with the release tag from CI and the `request_id`. Captured: unhandled errors and 5xx. Not captured: expected problem errors (400–429) — they are normal answers. Nothing is captured in a loop, and Sentry is never used as an event log. The DSN per environment comes from the environment.\
*Why:* the free plan holds 5,000 events a month; a validation error per keystroke spends it in a day and hides the one real crash.\
*Enforced by:* Both — CI: unit test of the capture filter; Review.

---

## 19. Performance

**CG-PERF-01 · The budgets are the ones in the sources — nothing else is optimised for.** 🔒 AD-PERF-01 · AD-STATE-01 · FE-PERF-01 · FE-PERF-03 · ADR-015\
Staff app: visual response < 100 ms; POS and booking actions API p95 ≤ 400 ms; skeleton for anything longer than 400 ms; LCP ≤ 2.5 s on a mid-range Android phone over 4G. Website: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; first-load JavaScript ≈ ≤ 90 KB gzip on info pages before the animation libraries, booking modal chunk ≈ ≤ 170 KB gzip; availability p95 ≤ 400 ms. Reports: 15 s statement timeout. A PR that adds a client dependency or a query on a POS path states its effect on these numbers.\
*Why:* if recording a walk-in is slower than remembering it, barbers go back to recording in the evening.\
*Enforced by:* Both — CI: Lighthouse CI budgets on the site routes (FE-QA-05); Review (request-duration lines for POS endpoints).

**CG-PERF-02 · Work is bounded.** 🔒 API-LIM-03 · API-DATA-08 · ADR-015\
Every list has `limit ≤ 100` and a cursor; no `findMany` without `take`; reports and the audit viewer ≤ 366 days; exports ≤ 50,000 rows, synchronous ≤ 5,000, PDF = summary + 1,000 rows; imports ≤ 10,000 rows; purges in batches. The numbers are the constants of CG-ARCH-09.\
*Why:* the customers list works with 50 rows today and takes the API down with 50,000 in two years.\
*Enforced by:* CI — `no-restricted-syntax` (`findMany` without `take` in repositories) · boundary tests (5,000 / 5,001 / 50,000 / 50,001 — ADR-015 action item 5).

**CG-PERF-03 · No optimisation and no new cache without a measurement and an ADR.** ⚠️ (ADR-001 · ADR-006 · ADR-015)\
The caches that exist are the ones the ADRs name: the Next.js data cache with tags, the 60-second booking-options cache, TanStack Query in the browser. No Redis, no materialised view, no summary table, no stored running total (closing totals are computed, not accumulated), no memoised money figure. Readable code first; a faster version only when a budget of CG-PERF-01 is missed and a number shows it.\
*Why:* a cached total that is one payment behind is a wrong closing; at < 5 requests / s the cache buys nothing.\
*Enforced by:* Review.

**CG-PERF-04 · Measure, then change.** ⚠️ (ADR-015 action item 2 · AD-PERF-01 · FE-PERF-08)\
A performance PR shows before and after: `EXPLAIN (ANALYZE)` on the one-year synthetic dataset, a Lighthouse run, or request-duration figures. The web app splits code by route so the POS does not load admin screens; heavy libraries (charts, QR scanner, the animation libraries) are loaded with `next/dynamic` after the page is interactive.\
*Why:* an optimisation without a number is a rewrite with a risk and no proven gain.\
*Enforced by:* Both — CI: Lighthouse CI; Review.

---

## 20. Documentation

**CG-DOC-01 · An architectural decision is an ADR, accepted by the owner.** 🔒 D-ARC-01 · D-PLT-11\
Write an ADR (in `point-sdd/docs/adr`, next number, never deleted — a reversal supersedes) before: adding a service, datastore or cache; adding a runtime library with architectural weight; changing a module boundary, the lock order, isolation or the auth model; a major-version jump; or reaching an ADR's "Revisit when" trigger. Implementation choices inside one change go in that change's `design.md`, citing the ADR that bounds them.\
*Why:* "why is there no Redis?" should be answered by a file, not by the developer who left.\
*Enforced by:* Review.

**CG-DOC-02 · Operations are runbooks, kept true by the PR that changes them.** 🔒 D-PLT-06 · ADR-001 (action item 5)\
`docs/ops/` holds install, deploy, rollback, backup / restore, secrets rotation, "the uptime alert fires" and "recover a deleted file". A PR that adds an environment variable, a job, a container, a migration step or a manual procedure updates the runbook and `.env.example` in the same PR. One-off admin tasks (restore, seed, data fix) are scripts in the repository, run with the same code and config — never ad-hoc SQL on the server.\
*Why:* the handover promise is that a new developer can run the system from the repo and the docs alone.\
*Enforced by:* Review — PR template checkbox.

**CG-DOC-03 · Comments explain why, and cite the ID.** ⚠️ (Clean Code)\
A comment states the reason or the rule (`// P4-RULE-06: nearest 100, half up`), never what the next line does. No commented-out code. No `TODO` / `FIXME` without an issue number. Exported functions of `packages/shared` and of a module's `index.ts` have one JSDoc line with units and what they throw.\
*Why:* the code already says what; only a comment can say that the odd-looking rounding is the owner's decision B6.\
*Enforced by:* Both — CI: `pnpm guards` (`TODO` / `FIXME` without `#<issue>`); Review.

**CG-DOC-04 · `VERSIONS.md` records the pinned versions.** 🔒 ADR-001 (action item 1) · D-ENG-01\
The root `VERSIONS.md` has one row per tool — tool · pinned version · date · reason · what it was checked against (peer ranges) — for Node, pnpm, Turborepo, TypeScript, ESLint and each plugin, Prettier, NestJS, Prisma, Next.js, React, Zod, Vitest, Playwright / Chromium, PostgreSQL and the OpenSpec CLI; Capacitor and Tauri are entered by the shell changes. The pin rule is CG-DEP-03. Node is the 24 line (🔒 D-ENG-01); its support window is noted in the file and re-checked at each upgrade. A version changes only in a PR that also edits `VERSIONS.md`. Each app and package has a README of at most one page (purpose, run, test); `CLAUDE.md` stays short and points here.\
*Why:* framework APIs differ by major (`proxy.ts` vs `middleware.ts`, the cache directives, the Prisma client) — code written for the wrong one compiles and misbehaves.\
*Enforced by:* CI — a script compares `VERSIONS.md` with the installed versions (`add-ci-guard-rails`).

---

## 21. Dependencies

**CG-DEP-01 · A dependency has to earn its place.** ⚠️ (ASVS V15)\
The PR that adds one states: what it is for; why an existing dependency or ~50 lines of our own code will not do; that it is maintained (a release in the last 12 months), typed, and has no surprising install script; its licence; its size effect on the web bundle; where it runs (server / browser). A runtime dependency on a money path needs both developers' agreement.\
*Why:* each package is code nobody here reviewed, running with the database password.\
*Enforced by:* Both — CI: a PR check requires the "Dependency" note when `package.json` changes; Review.

**CG-DEP-02 · Licences are permissive.** ⚠️\
Allowed: MIT, ISC, BSD-2 / 3-Clause, Apache-2.0, and MPL-2.0 used unmodified. Not allowed: GPL, AGPL, SSPL, "custom" or missing licences. Named exceptions sit in the allowlist with their source: `gsap` (fixed by the owner — FE-IMPL-05) and the fonts, which ship with their licence files (ADR-013).\
*Why:* the business owns this code; a copyleft library in the bundle changes what it owns.\
*Enforced by:* CI — licence check on `pnpm licenses list --json` against the allowlist.

**CG-DEP-03 · Versions are exact, the lockfile is law, and a tool is pinned where every plugin supports it.** 🔒 D-ENG-01 · ADR-001 (action item 1) + ⚠️\
`save-exact`; `pnpm-lock.yaml` committed; `pnpm install --frozen-lockfile` in CI and in Docker builds; Node 24 and pnpm pinned by `engines` / `packageManager`; Docker base images pinned by tag. No `latest`, no range, no dependency from a git URL or tarball. **Pin rule:** a tool is pinned at the newest major that every lint plugin, preset and example of this guideline supports — not at npm `latest`: TypeScript at the newest major inside `typescript-eslint`'s peer range; one ESLint major that every plugin of §24 accepts (a plugin with no release for it is replaced by its maintained equivalent); Prisma on the 7.x line by exact version, never a pre-release and never a dist-tag that points at one. The values of 02/Oct/2026 are in OPEN-CG-02 and are verified when the scaffold is built.\
*Why:* "works on my machine" between two developers is almost always two resolved versions — and a plain `pnpm add prisma` today installs a release candidate with another client API.\
*Enforced by:* CI — `.npmrc` (`save-exact`, `engine-strict`) · `pnpm install --frozen-lockfile` in CI and in the Dockerfiles.

**CG-DEP-04 · The stack is fixed; one library per job.** 🔒 D-ENG-01 · ADR-001 · ADR-002 · ADR-007 · ADR-008 · ADR-013 · ADR-015 · FE-IMPL-05\
Fixed: NestJS · Prisma + SQL migrations · PostgreSQL 16 · Next.js 16 · Tailwind · shadcn/ui · lucide-react · TanStack Query · React Hook Form · Zod · next-intl · pg-boss · Socket.IO · pino · exceljs · Vitest · Playwright; `decimal.js` for rates (CG-MONEY-04). Animation is `motion` and `gsap` (+ ScrollTrigger) only — ⚠️ `gsap` only in the `site/` tree. Not added: a second library for a covered job — another HTTP client, date library, form or validation library, global state store, ORM or query builder, icon set, animation or 3D library, Storybook, a Redis client, or a JWT session library.\
*Why:* two date libraries mean two answers to "what day is it in Yangon".\
*Enforced by:* CI — `no-restricted-imports` deny list (also checked against `package.json`).

**CG-DEP-05 · Dependencies are audited and updated on a schedule.** ⚠️ (OWASP Top 10 A03:2025)\
`pnpm audit --prod` fails CI on high or critical findings (a documented ignore carries an expiry date). Update PRs are opened weekly, grouped, for minor and patch versions; a major goes through CG-DOC-01 and `VERSIONS.md`. A version is not adopted in its first 7 days (pnpm `minimumReleaseAge`, where the pinned pnpm supports it); install scripts run only for an allowlist. The API image is rebuilt monthly for Chromium updates (ADR-013 action item 4).\
*Why:* most supply-chain attacks are caught within days — and most breaches use a fix that was already available.\
*Enforced by:* CI — `pnpm audit --prod` · scheduled update PRs.

**CG-DEP-06 · Workspace packages are used through their front door.** ⚠️ (pnpm workspaces + Turborepo — D-ENG-01)\
Internal packages are referenced as `workspace:*` and imported by package name through their `exports` — no relative path into another package's `src`. Each package declares what it imports (no phantom dependencies); `packages/*` never depends on `apps/*`. Unused dependencies and exports are removed.\
*Why:* a deep import works until the package is built or moved — and then fails only in production.\
*Enforced by:* CI — `import-x/no-relative-packages` · `knip`.

---

## 22. Working with Claude Code

**CG-AI-01 · `/opsx:apply` runs in `point-barber`, one change per session.** → see **CG-META-03** (one change per session and what the session reads first) and **CG-META-05** (which command runs in which repository).

**CG-AI-02 · Tests before code for money, permission and date rules.** → see **CG-TEST-03** (the agent writes the tests from the scenarios, shows them failing, then implements — and never edits a test to fit its code).

**CG-AI-03 · When the spec is silent, the agent stops.** → see **CG-META-04** (no "reasonable default", no "I assumed": stop the task, state both readings, take it to `point-sdd`).

**CG-AI-04 · The agent never invents.** 🔒 D-UX-02 · D-PLT-11 · D-ROLE-08\
Not a business rule, permission code, setting key, error code, status code, endpoint, table or column; not a colour, logo, font or icon set; not UI wording in either language; not a fixture value. All of these come from the sources; a `{{placeholder}}` stays a placeholder until the owner fills it.\
*Why:* an invented colour is a small embarrassment; an invented permission code is a hole in the role matrix.\
*Enforced by:* Both — CI: typed catalogues (CG-NAME-05), the colour and font guards (CG-UI-05), `pnpm i18n:check`; Review.

**CG-AI-05 · IDs are cited, and only IDs that were found in the files.** 🔒 D-PLT-17 · `openspec/config.yaml` (apply guidance)\
Commits and the PR written with the agent carry the change id and the decision, endpoint, UX and CG IDs. The agent cites an ID only after finding it in the source file (`grep`); an ID recalled from memory is treated as invented.\
*Why:* a plausible but non-existent decision ID in a PR sends the reviewer looking for a decision that was never made.\
*Enforced by:* Both — CI: `spec:trace` checks that the IDs in the PR exist in `point-sdd`; Review.

**CG-AI-06 · Generated code is reviewed like a junior developer's PR, and the guard rails are never loosened to get green.** ⚠️\
The developer who opens the PR has read every line and answers for it; the other developer reviews it like any PR (CG-REVIEW-01). To make a check pass, the agent does not delete, skip or weaken a test, add an `eslint-disable` or `@ts-expect-error`, widen a type, edit an applied migration, change a fixture, lower a coverage threshold or touch the CI and lint configuration. A guard-rail file changes only where a task of the change says so (the PR names the task) or in its own `chore/` PR.\
*Why:* the fastest way to green is to remove the check — an agent will find it unless told not to.\
*Enforced by:* Both — CI: the PR check flags a change to guard-rail files (`.github/`, `eslint.config.mjs`, `tools/eslint/`, `tools/eslint-plugin-point/`, `tools/guards/`, coverage thresholds) and fails unless the PR names the task that asks for it; Review.

**CG-AI-07 · The diff contains the change and nothing else.** ⚠️ (limits Clean Code's "leave it cleaner"; D-PLT-20)\
No drive-by refactor, rename, reformat, comment rewrite, dependency bump or "while I was here" fix — those go in a `chore/` PR. The agent touches only the files its tasks need and regenerates generated files with their tool, not by hand.\
*Why:* a 30-line fix inside a 900-line "tidy-up" is a 30-line fix nobody reviewed.\
*Enforced by:* Review (+ the size check of CG-GIT-03).

**CG-AI-08 · No secrets or customer data in prompts; no production access for the agent.** ⚠️ (CG-SEC-05 · CG-SEC-11)\
`.env` values, keys, cookies, production rows, customer phones and salaries are never pasted into a prompt or a file the agent reads; `.env*` (except `.env.example`) is in the agent's deny list. The agent holds no production credential and runs nothing against production. Destructive commands (`git push --force`, `prisma migrate reset`, deleting a volume) need the developer's confirmation every time. After each edit the hook (`tools/claude-hooks/after-edit.mjs`) runs format, lint, typecheck and the related unit tests.\
*Why:* a prompt is a copy of whatever is pasted into it, stored outside the server.\
*Enforced by:* Both — CI: `gitleaks`; the committed `.claude/settings.json` deny rules; Review.

---

## 23. Definition of Done for a pull request

A machine check applies from the day the change named in §24 ("Built by") has delivered it; until then the item is checked by hand and the PR says so. The order for a change is the team's workflow: apply → CI green + review → test cases → test → NG fixed on the branch → squash merge → archive (CG-GIT-05).

- [ ] **Spec:** the change exists in `point-sdd` with nothing left under *Needs the owner's answer*; the PR title is a Conventional Commit whose scope is the change id; nothing in the diff goes beyond the tasks (CG-META-03, CG-GIT-02, CG-AI-07).
- [ ] **CI green:** jobs `static` (format, lint, typecheck, guards, `gitleaks`), `unit`, `db`, `integration`, `images`, `e2e`, `pr-title` — plus the checks of §24 that exist by then (CG-GIT-05).
- [ ] **Local checks:** `openapi:check` and `spec:trace` run on the developer's machine against `../point-sdd` and are ticked in the PR — local until OPEN-CG-04 is closed; `pnpm db:check-source` for a database change (CG-API-08, CG-TEST-07, CG-DB-01).
- [ ] **Scenarios:** every scenario of the tasks done has a test with its name, or is named as workbook-only; boundary cases included (CG-TEST-07, CG-TIME-05).
- [ ] **Money:** `Mmk` through the money module; totals from the server; each rounding cites its rule (CG-MONEY-01..07).
- [ ] **Access:** one decorator per endpoint with the level of the API part; allow and deny tests; scope passed to every query (CG-API-02, CG-SEC-02, CG-TEST-05).
- [ ] **Writes:** one transaction opened by the service; locks in the one order; checks after locks; audit emitted or skipped; idempotent by key or state with a parallel test; no network inside the transaction (CG-DB-03, CG-DB-06, CG-DB-07, CG-DB-10, CG-IDEM-01..05).
- [ ] **Data:** no hard delete; finished rows untouched; migration additive and `docs/db` updated first (CG-DB-01, CG-DB-02, CG-DB-11).
- [ ] **Time:** clock injected; `businessDateOf`; day and month boundary tests (CG-TIME-02, CG-TIME-03, CG-TIME-05).
- [ ] **Screen** (if any): shared components, tokens, no raw string; Myanmar and English at 320 / 360 / 768 / 1280 px; loading, empty, error, forbidden, lock, offline states; axe clean; screenshots MM / EN at 360 px in the PR; the screen DoD of AD-QA-01 or FE-QA-01 (CG-UI-04..10, CG-I18N-01..04).
- [ ] **Errors and logs:** catalogue codes with keys in both languages; nothing swallowed; nothing from CG-OBS-03 logged.
- [ ] **Docs:** runbook, `.env.example`, `VERSIONS.md`, ADR updated where the change needs it (CG-DOC-01..04).
- [ ] **Passes:** "what can we remove?" done; security pass ticked for money / permission / auth / migration changes (CG-REVIEW-03, CG-REVIEW-04).
- [ ] **IDs:** change id, decision, endpoint, UX and CG IDs cited in the PR (CG-META-02, CG-GIT-04).
- [ ] **Review:** approved by the other developer (CG-REVIEW-01).
- [ ] **Workbook — last PR of the change only:** `/point-generate-tests <change-id>` run in `point-sdd`, the cases executed against this branch's environment, NG fixes committed on this branch, no NG open (CG-GIT-05).
- [ ] **Merge:** squash (CG-GIT-05).

After the last PR of a change is merged: `/opsx:archive <change-id>` in `point-sdd`.

---

## 24. Lint and CI rule inventory

**🔒 D-ENG-01.** Everything a machine can check fails CI. This table is the work list of machine checks; the last column names the change that builds each one, and §23 applies a check only from the day that change has delivered it. `add-repo-scaffold` builds the cheap checks that guard the code it creates (the compiler flags, formatting, the module-boundary and access-decorator lint, the database checks, `gitleaks`, the branch-name and PR-title checks, `check-migrations`, the `$transaction` and `process.env` restrictions, the `Math.random` guard, the CI jobs `static` · `unit` · `db` · `integration` · `images` · `e2e` · `pr-title`); `add-shared-ui-components` the web guard rails and `pnpm i18n:check`; `add-foundation-auth-access` and `add-walkin-visit-checkout` the checks that need their code; **`add-ci-guard-rails`** (wave 1) everything heavier — the general `typescript-eslint` rule set, coverage thresholds, `spec:trace`, `openapi:check`, `knip`, the licence and `pnpm audit` jobs, Lighthouse CI, the PR size and description checks, the table-ownership guard, the route-completeness test, the log canary, `expectQueryCount`. A row that needs code which does not exist yet stays with the change that brings that code, named as "feature". `pnpm guards` runs every `tools/guards/check-*.mjs`; a new forbidden pattern is a new small guard file whose failure message carries the CG ID. Custom ESLint rules: `point/one-access-decorator`, `point/no-number-money`, `point/no-raw-status`. Plugin names assume the pins of OPEN-CG-02 (ESLint 9.x; `eslint-plugin-import-x`, rule prefix `import-x/`). Row numbers are stable — the change designs cite them.

| # | Check | Tool | Enforces | Built by |
| --- | --- | --- | --- | --- |
| 1 | Strict compile of every package (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`); typed catalogues and language keys | `tsc --noEmit` (`pnpm typecheck`) | CG-TS-01 · CG-NAME-05 · CG-I18N-02 · CG-AI-04 | `add-repo-scaffold` |
| 2 | Formatting | `pnpm format:check` (Prettier) | CG-GIT-05 | `add-repo-scaffold` |
| 3 | No `@ts-ignore`; suppressions carry a reason | `@typescript-eslint/ban-ts-comment` · `eslint-comments/require-description` · `eslint-comments/no-unlimited-disable` | CG-TS-01 · CG-META-05 | `add-ci-guard-rails` |
| 4 | No `any`, no unsafe use of `any` | `@typescript-eslint/no-explicit-any` · `no-unsafe-assignment` · `no-unsafe-member-access` · `no-unsafe-call` · `no-unsafe-return` · `no-unsafe-argument` | CG-TS-02 | `add-ci-guard-rails` |
| 5 | No `x!`, no narrowing cast (the money module's brand cast is exempted by a file override) | `@typescript-eslint/no-non-null-assertion` · `@typescript-eslint/no-unsafe-type-assertion` | CG-TS-03 | `add-ci-guard-rails` |
| 6 | No TypeScript `enum` | `no-restricted-syntax` (`TSEnumDeclaration`) | CG-TS-04 | `add-ci-guard-rails` |
| 7 | No number literal compared with or assigned to a member named `status` or ending in `_status` | **`point/no-raw-status`** (custom) | CG-TS-04 · CG-UI-09 · CG-PRIN-03 | `add-shared-ui-components` |
| 8 | Exhaustive `switch` | `@typescript-eslint/switch-exhaustiveness-check` | CG-TS-05 · CG-PRIN-05 | `add-ci-guard-rails` |
| 9 | Immutability | `prefer-const` · `no-var` · `no-param-reassign` · `@typescript-eslint/prefer-readonly` | CG-TS-06 | `add-ci-guard-rails` |
| 10 | Promises handled | `@typescript-eslint/no-floating-promises` · `no-misused-promises` · `await-thenable` · `return-await` | CG-TS-07 | `add-ci-guard-rails` |
| 11 | Explicit conditions | `eqeqeq` · `@typescript-eslint/strict-boolean-expressions` · `@typescript-eslint/prefer-nullish-coalescing` | CG-TS-08 · CG-PRIN-03 | `add-ci-guard-rails` |
| 12 | snake_case only for data fields | `@typescript-eslint/naming-convention` | CG-NAME-02 | `add-ci-guard-rails` |
| 13 | Named exports, file names by role, no `utils.ts` | `import-x/no-default-export` (Next.js override) · `unicorn/filename-case` · `pnpm guards` | CG-NAME-03 | `add-ci-guard-rails` |
| 14 | Another module is imported only through its `index.ts` | `no-restricted-imports` (`tools/eslint/boundaries.mjs`) | CG-ARCH-01 · CG-NAME-04 | `add-repo-scaffold` |
| 15 | Prisma client only in `repositories/` and `common/database`; never in controllers | `no-restricted-imports` (`boundaries.mjs`) | CG-ARCH-02 · CG-DB-04 · CG-API-01 | `add-repo-scaffold` |
| 16 | A repository writes only tables its module owns | `pnpm guards` (table-ownership check against `module-map.md`) | CG-ARCH-02 | `add-ci-guard-rails` |
| 17 | No realtime event schema with an amount | unit test over the realtime schemas of `packages/shared` | CG-ARCH-03 | feature — `add-realtime-gateway` |
| 18 | Dependency direction, no cycles, the two web trees apart, pure rule files | `import-x/no-restricted-paths` · `import-x/no-cycle` | CG-ARCH-04 · CG-UI-01 · CG-TEST-02 | `add-ci-guard-rails` |
| 19 | No in-process timers for business work; pg-boss only behind the jobs service; each handler passes a "run twice" test | `no-restricted-globals` · `no-restricted-imports` · unit tests | CG-ARCH-05 | `add-foundation-auth-access` (jobs service) · feature (each job's test) |
| 20 | Web app has no database client, no `'use server'`, no route handler under `/api` | `no-restricted-imports` · `pnpm guards` (`check-web-api-routes.mjs`) | CG-ARCH-06 | `add-repo-scaffold` · `add-ci-guard-rails` (`'use server'` guard) |
| 21 | `packages/shared` uses no Node-only or browser-only API | `import-x/no-nodejs-modules` · `no-restricted-globals` | CG-ARCH-07 | `add-ci-guard-rails` |
| 22 | SDKs (S3, mail, pg-boss, Socket.IO, Chromium driver) only inside the one folder that wraps each | `no-restricted-imports` | CG-ARCH-08 · CG-SEC-08 | feature — the change that adds each SDK (`add-foundation-auth-access`: pg-boss, mail · `add-walkin-visit-checkout`: S3 client, Chromium driver) |
| 23 | `process.env` only in the config modules; `.env.example` = the env schemas; the env schema stops the boot | `n/no-process-env` · `pnpm guards` (`check-env-example.mjs`) · boot-time env schema | CG-ARCH-09 · CG-SEC-05 · CG-PRIN-05 | `add-repo-scaffold` |
| 24 | Exactly one access decorator per handler; a handler policy is called first | **`point/one-access-decorator`** (custom) | CG-API-02 | `add-repo-scaffold` (the handler-policy half: `add-attachments-upload`) |
| 25 | No `class-validator`; no raw `@Body` / `@Query` / `@Param` / `@Headers`; no `.passthrough()` / `z.looseObject` | `no-restricted-imports` · `no-restricted-syntax` | CG-API-03 | `add-ci-guard-rails` |
| 26 | Public DTOs and staff schemas do not import each other; responses match their schema | `no-restricted-imports` · integration assertion | CG-API-04 · CG-SEC-07 | feature — the first `/v1/public` change (`add-public-website-pages`) |
| 27 | Generated OpenAPI = the contract in `point-sdd` | `openapi:check` (`oasdiff` or equivalent) — local until OPEN-CG-04 | CG-API-08 · CG-API-05 · CG-MONEY-01 · CG-TIME-01 | `add-ci-guard-rails` |
| 28 | Stale `expected_updated_at` → 409; `PATCH`: an absent key leaves the column, `null` clears it | schema unit tests · integration tests | CG-API-06 · CG-TS-09 | feature — the first editable master resource |
| 29 | Migrations deploy on an empty PostgreSQL 16; committed schema = the database; constraint tests pass; `db/source/` = its manifest | CI job `db`: migrate · `pnpm db:check-introspection` · `pnpm db:test`; job `static`: manifest hash check; `pnpm db:check-source` locally | CG-DB-01 · CG-PRIN-06 | `add-repo-scaffold` |
| 30 | Merged migrations untouched; no destructive DDL in a new one | `pnpm guards` (`check-migrations.mjs`) | CG-DB-02 | `add-repo-scaffold` |
| 31 | `$transaction` only in `common/database`; the API runs as `point_app` in `Asia/Yangon`; trigger audit rows carry the actor; an `@Audited()` handler without emit / skip fails; a refused outcome stays committed | `no-restricted-syntax` · start-up check · integration tests | CG-DB-03 | `add-repo-scaffold` (lint, start-up check) · `add-foundation-auth-access` (actor, audit and outcome tests) |
| 32 | No `$queryRawUnsafe` / `$executeRawUnsafe` / free `Prisma.raw` | `no-restricted-syntax` | CG-DB-05 · CG-SEC-04 | `add-ci-guard-rails` |
| 33 | Only transaction-level advisory locks, only in repositories and `common/database` | `pnpm guards` | CG-DB-08 | `add-ci-guard-rails` |
| 34 | Query count of list endpoints is bounded | integration helper `expectQueryCount` | CG-DB-09 | `add-ci-guard-rails` |
| 35 | No `delete` / `deleteMany` / `DELETE FROM` without a `hard-delete:` source comment | `pnpm guards` | CG-DB-11 | `add-ci-guard-rails` |
| 36 | Each mapped constraint error returns its API code | integration tests | CG-DB-12 | `add-walkin-visit-checkout` (the first mapped constraints), then each change that maps one |
| 37 | No `Number()`, `parseInt()`, unary `+` or arithmetic operator on an identifier or member named `amount` or ending in `_amount` / `Amount`, outside the money module; no `parseFloat` anywhere | **`point/no-number-money`** (custom) · `parseFloat` ban | CG-MONEY-01 · CG-MONEY-02 · CG-MONEY-03 | `add-repo-scaffold` (`parseFloat`) · `add-shared-ui-components` (`apps/web`, `packages/*`) · `add-walkin-visit-checkout` (`apps/api`) |
| 38 | No `BigInt.prototype.toJSON` | `pnpm guards` | CG-MONEY-02 | `add-ci-guard-rails` |
| 39 | Money module: conversions and sums; decimals in, integers out; parts sum to the total | unit + property-based tests (`fast-check`) | CG-MONEY-04 · CG-MONEY-05 · CG-MONEY-07 | `add-shared-ui-components` (module and unit tests) · `add-ci-guard-rails` (property-based tests) |
| 40 | An unknown member is stripped; a wrong client total is refused | schema unit tests · integration tests | CG-MONEY-06 | `add-walkin-visit-checkout` |
| 41 | No `toISOString().slice(` / `.split(` for dates | `pnpm guards` | CG-TIME-02 | `add-ci-guard-rails` |
| 42 | No `new Date()` without arguments, no `Date.now()` outside the clock (API) and `ClockProvider` (web) | `no-restricted-syntax` | CG-TIME-03 · CG-PRIN-03 | `add-shared-ui-components` (`apps/web`, `packages/*`) · `add-ci-guard-rails` (`apps/api`) |
| 43 | No local-time `Date` getters / setters outside `packages/shared/src/time` and `src/format`; the `time/` and `format/` suites run under `TZ=UTC`, `TZ=Asia/Yangon` and `TZ=America/Los_Angeles` | `no-restricted-syntax` · CI matrix | CG-TIME-04 · CG-TIME-05 | `add-shared-ui-components` (`apps/web`, `packages/*`, the matrix) · `add-ci-guard-rails` (`apps/api`) |
| 44 | No `toLocale*String` / `Intl.*` formatter outside `packages/shared/src/format` | `no-restricted-syntax` | CG-TIME-06 · CG-I18N-03 | `add-shared-ui-components` |
| 45 | Nothing swallowed; only `Error`s thrown | `no-empty` · `@typescript-eslint/only-throw-error` · `@typescript-eslint/use-unknown-in-catch-callback-variable` · `preserve-caught-error` | CG-ERR-01 | `add-ci-guard-rails` |
| 46 | Every failure is problem details | integration tests against the problem schema | CG-ERR-02 | `add-repo-scaffold` |
| 47 | No `HttpException` outside `common/http` | `no-restricted-imports` | CG-ERR-03 | `add-ci-guard-rails` |
| 48 | Language files: same keys in `my` and `en`, no empty value, every status constant and error code has its key | `pnpm i18n:check` (`check-i18n.mjs`) | CG-ERR-03 · CG-I18N-01 · CG-I18N-02 · CG-PRIN-05 | `add-shared-ui-components` |
| 49 | Session revoke / status / CSRF header / foreign `Origin`; JWT libraries only in `modules/auth`; browser storage only through the typed helper | integration tests · `no-restricted-imports` · `no-restricted-globals` | CG-SEC-01 | `add-foundation-auth-access` (tests) · `add-ci-guard-rails` (import and storage restrictions) |
| 50 | Every endpoint has registered allow and deny tests | completeness test over the route list | CG-TEST-05 · CG-SEC-02 · CG-API-02 | `add-ci-guard-rails` |
| 51 | No comparison against a role name; no `Math.random` in API / shared | `pnpm guards` (`check-math-random.mjs`; role-name guard) | CG-SEC-02 · CG-SEC-06 | `add-repo-scaffold` (`Math.random`) · `add-ci-guard-rails` (role names) |
| 52 | No `dangerouslySetInnerHTML`, `eval`, `new Function`; formula guard in exports | `react/no-danger` · `no-eval` · `no-implied-eval` · `no-new-func` · export tests | CG-SEC-04 | `add-ci-guard-rails` (lint) · feature — `add-data-export` (formula tests) |
| 53 | Secrets never committed; no non-fixture e-mail in tests | `gitleaks` (job `static` + pre-commit) · `pnpm guards` | CG-SEC-05 · CG-SEC-11 · CG-AI-08 | `add-repo-scaffold` (`gitleaks`) · `add-ci-guard-rails` (e-mail guard) |
| 54 | Upload checks (magic bytes, EXIF removal) | integration tests | CG-SEC-08 | feature — `add-attachments-upload` |
| 55 | Every `@Public()` handler has a rate-limit class | test over the route list | CG-SEC-09 | `add-ci-guard-rails` |
| 56 | Action endpoints write an audit row; listed fields are redacted | integration tests | CG-SEC-10 | `add-foundation-auth-access` |
| 57 | Edge rules (blocked paths, internal keys, secret distribution); no CORS registered | `e2e/edge.spec.ts` · unit test of the bootstrap | CG-SEC-12 | `add-repo-scaffold` |
| 58 | Operations that require `Idempotency-Key` refuse a request without it; replay → 200 + header; mismatch → 422; action twice → one effect; five parallel requests → one row; the named races | integration tests | CG-IDEM-01 · CG-IDEM-02 · CG-IDEM-03 · CG-IDEM-05 · CG-DB-06 · CG-DB-07 · CG-API-07 | `add-foundation-auth-access` (the helper, on fixtures) · `add-walkin-visit-checkout` (the first endpoints and races) |
| 59 | No `fetch` in components and hooks, no `axios` | `no-restricted-globals` · `no-restricted-imports` | CG-UI-03 | `add-shared-ui-components` |
| 60 | Raw `button` / `input` / `select` / `textarea` and `@radix-ui/*` only in `packages/ui`; `/dev/ui` answers 404 in production | `react/forbid-elements` · `no-restricted-imports` · `pnpm guards` (`check-catalogue-flag.mjs`) · e2e 404 spec | CG-UI-04 | `add-shared-ui-components` |
| 61 | No colour literal, palette class, arbitrary colour value, `font-family` outside `tokens.css` | `tools/eslint/web.mjs` · `pnpm guards` (`check-css.mjs`) | CG-UI-05 · CG-AI-04 | `add-repo-scaffold` (hex, arbitrary classes, `font-family`) · `add-shared-ui-components` (palette classes, `rgb()` / `hsl()` / `oklch()`, `style`) |
| 62 | Query rules; no inline `queryKey`; no second state or form library | `@tanstack/eslint-plugin-query` · `no-restricted-syntax` · `no-restricted-imports` | CG-UI-06 · CG-UI-07 | `add-shared-ui-components` |
| 63 | `onMutate` only in allowlisted files | `no-restricted-syntax` | CG-UI-08 | `add-shared-ui-components` |
| 64 | No `navigator.userAgent`, no `user-scalable=no` | `pnpm guards` (`check-web-globals.mjs`) | CG-UI-09 · CG-UI-10 | `add-shared-ui-components` |
| 65 | Accessibility: static, on the catalogue and on the flow pages | `eslint-plugin-jsx-a11y` · `@axe-core/playwright` | CG-UI-10 | `add-shared-ui-components` (lint, catalogue) · feature (each flow's axe spec) |
| 66 | No literal text in JSX or in `aria-label`, `placeholder`, `title`, `alt` | raw-JSX-string rule of `tools/eslint/web.mjs` | CG-I18N-01 | `add-repo-scaffold` (text) · `add-shared-ui-components` (attributes) |
| 67 | Golden files: receipts, payslips, stacked Myanmar text | integration tests (ADR-013) | CG-I18N-04 · CG-I18N-05 | `add-walkin-visit-checkout` (receipts) · feature — `add-payroll-runs` (payslips) |
| 68 | Unit, integration, e2e and database jobs on every PR; the integration job has a `postgres:16` service; no database substitutes | GitHub Actions jobs `unit` · `integration` · `e2e` · `db` · `no-restricted-imports` | CG-TEST-01 · CG-TEST-04 | `add-repo-scaffold` (jobs) · `add-ci-guard-rails` (import restriction) |
| 69 | End-to-end flows at 360 × 800 and 1280 × 800, MM + EN, OTP from Mailpit; lost-reply and error-family cases | Playwright (`pnpm e2e`) | CG-TEST-06 · CG-ERR-05 · CG-IDEM-04 | `add-foundation-auth-access` (sign-in) · `add-walkin-visit-checkout` (walk-in) · feature (each later flow) |
| 70 | Scenario ↔ test names; change id and cited IDs exist in `point-sdd` | `spec:trace` — local until OPEN-CG-04 | CG-TEST-07 · CG-META-03 · CG-AI-05 | `add-ci-guard-rails` |
| 71 | Fixture module equals the `spec-fixtures.md` values | unit test | CG-TEST-08 | `add-foundation-auth-access` |
| 72 | No `.only`, `.skip`, fixed waits | `vitest/no-focused-tests` · `vitest/no-disabled-tests` · `playwright/no-wait-for-timeout` · `playwright/no-focused-test` · `playwright/no-skipped-test` | CG-TEST-09 | `add-ci-guard-rails` |
| 73 | Coverage floors per path | Vitest `coverage.thresholds` | CG-TEST-10 | `add-ci-guard-rails` |
| 74 | Branch name; protected `main`, squash only, one approval that is not the author, the seven jobs required | `check-branch-name.mjs` (job `pr-title`) · GitHub branch protection | CG-GIT-01 · CG-GIT-05 · CG-REVIEW-01 | `add-repo-scaffold` (check, README) · owner (plan — OPEN-CG-06) |
| 75 | PR title is a Conventional Commit whose scope is the change id | job `pr-title` (`tools/guards/check-pr-title.mjs`) · `commit-msg` hook | CG-GIT-02 | `add-repo-scaffold` |
| 76 | PR template (seven sections); a missing section, the security-pass tick, the dependency note, the size and a guard-rail file changed without a named task fail | `.github/pull_request_template.md` · PR check script (GitHub Action) | CG-GIT-03 · CG-GIT-04 · CG-REVIEW-04 · CG-DEP-01 · CG-AI-06 | `add-repo-scaffold` (template) · `add-ci-guard-rails` (checks) |
| 77 | File-size limit; `TODO` / `FIXME` need an issue number | `pnpm guards` | CG-SEC-11 · CG-DOC-03 | `add-ci-guard-rails` |
| 78 | No `console.*` | `no-console` | CG-OBS-01 | `add-ci-guard-rails` |
| 79 | One request id in header, problem body, audit row, log line | integration test | CG-OBS-02 | `add-repo-scaffold` (header, body, log) · `add-foundation-auth-access` (audit row) |
| 80 | Logs and Sentry envelopes of the integration run contain no fixture phone, token or OTP; the capture filter drops 4xx | canary test · unit test | CG-OBS-03 · CG-OBS-04 · CG-SEC-06 | `add-ci-guard-rails` (canary) · feature — `add-staging-deploy` (capture filter) |
| 81 | Website budgets (LCP, INP, CLS, script size) | Lighthouse CI | CG-PERF-01 · CG-PERF-04 · CG-UI-02 | `add-ci-guard-rails` |
| 82 | No `findMany` without `take`; export / import boundaries | `no-restricted-syntax` · integration tests | CG-PERF-02 | `add-ci-guard-rails` (lint) · feature — `add-data-export`, `add-data-import` (boundaries) |
| 83 | `VERSIONS.md` = installed versions | script | CG-DOC-04 | `add-ci-guard-rails` (`add-repo-scaffold` writes the file) |
| 84 | Licence allowlist; a font file has its licence file | script on `pnpm licenses list --json` · `pnpm fonts:check` | CG-DEP-02 | `add-ci-guard-rails` (licences) · `add-shared-ui-components` (fonts) |
| 85 | Frozen lockfile; pinned engine; exact versions | `.npmrc` (`save-exact`, `engine-strict`) · `pnpm install --frozen-lockfile` | CG-DEP-03 | `add-repo-scaffold` |
| 86 | Deny list of second libraries | `no-restricted-imports` (+ `package.json` check) | CG-DEP-04 | `add-shared-ui-components` (web libraries) · `add-ci-guard-rails` (the rest) |
| 87 | Known vulnerabilities | `pnpm audit --prod` | CG-DEP-05 | `add-ci-guard-rails` |
| 88 | No relative import into another package; no unused dependency or export | `import-x/no-relative-packages` · `knip` | CG-DEP-06 | `add-ci-guard-rails` |
| 89 | Outside calls time out and fail closed (captcha, mail, Google, bucket) | integration tests with the fakes of CG-ARCH-08 | CG-ERR-06 | feature — each change that adds an outside call (`add-foundation-auth-access`: mail, Google · `add-walkin-visit-checkout`: bucket) |

Of the 151 rule IDs, 6 are pointers to another rule (CG-ERR-04, CG-SEC-03, CG-GIT-06, CG-AI-01, CG-AI-02, CG-AI-03). Of the 145 rules, 15 are enforced by **Review** only — no machine check: CG-META-01, CG-META-02, CG-META-04, CG-PRIN-01, CG-PRIN-02, CG-PRIN-04, CG-NAME-01, CG-DB-10, CG-TEST-03, CG-REVIEW-02, CG-REVIEW-03, CG-PERF-03, CG-DOC-01, CG-DOC-02, CG-AI-07. The other 130 have a CI check (66) or a CI check plus a review point (64).

---

## 25. Where a reference or a common practice was overridden

Rows 1–15 are overridden by a locked rule; rows 16–17 by a ⚠️ rule of this guideline.

| # | The reference or common practice says | This system does | Because |
| --- | --- | --- | --- |
| 1 | Google TS: use plain `enum` | `as const` objects holding the smallint codes; no `enum` (CG-TS-04) | 🔒 D-DB-03 · API-DATA-04 — codes on the wire, named constants in code |
| 2 | Google TS: `lowerCamelCase` properties | snake_case data fields end to end, no mapping layer (CG-NAME-02) | 🔒 API-SHAPE-03 · D-DB-01 — "devs never translate names" |
| 3 | Common practice / ASVS V9: JWT access + refresh tokens | Opaque server-side session in an HttpOnly cookie + CSRF header (CG-SEC-01) | 🔒 ADR-005 · D-AUTH-06 — instant revoke |
| 4 | Common practice: a generic `idempotency_keys` table with a stored response (also the review's §5.4 recommendation) | The key is the row's `client_request_id`; a replay compares identifying fields (CG-IDEM-02) | 🔒 D-DB-12 · API-IDEM-02 |
| 5 | Common practice: SERIALIZABLE or REPEATABLE READ for money writes | READ COMMITTED + explicit locks in one order + checks after the locks (CG-DB-06) | 🔒 API-IDEM-06 · ADR-015 #1a |
| 6 | Common practice: a transactional outbox for events | After-commit best-effort events; jobs that must not be lost are enqueued in the transaction (CG-ARCH-03 · CG-ARCH-05) | 🔒 D-DB-12 · ADR-002 |
| 7 | Next.js docs: Server Actions / route handlers for mutations | No mutation in Next.js — the NestJS API is the only writer (CG-ARCH-06) | 🔒 ADR-001 rule 2 · ADR-009 |
| 8 | 12-Factor III: all configuration in the environment | Only deployment config and secrets are env; owner-tunable values are database settings (CG-ARCH-09) | 🔒 D-PLT-16 |
| 9 | 12-Factor VI / VIII: fully stateless processes that scale out | One API instance with a few named in-process stores (hand-off store, in-memory Socket.IO adapter, 60 s cache) | 🔒 ADR-001 · ADR-005 · ADR-008 |
| 10 | Prisma docs: schema-first migrations, camelCase fields with `@map` | Hand-written SQL migrations from `docs/db`; the Prisma schema is introspected, so its names are the table and column names (CG-DB-01 · CG-NAME-02) | 🔒 `docs/db` (D-DB-12) · API-SHAPE-03 |
| 11 | REST convention: `DELETE` removes the resource | `delete` = archive / deactivate / cancel; real deletes only where a part allows (CG-DB-11) | 🔒 D-DAT-05 · API-PERM-06 |
| 12 | Common practice: API on its own host with CORS | One origin per app, API under `/api`, CORS not registered (CG-SEC-12) | 🔒 ADR-009 |
| 13 | Common advice: send money as a string or a decimal type | JSON integer on the wire, `Mmk` (`bigint`) in code (CG-MONEY-01 · CG-MONEY-02) | 🔒 API-DATA-02 · D-PLT-04 · AD-IMPL-05 |
| 14 | Common practice: Storybook for a component catalogue | A `/dev/ui` page (CG-UI-04) | 🔒 D-ENG-01 |
| 15 | Common practice: a test-only login or seeded password for e2e | Real e-mail OTP read from Mailpit (CG-TEST-06) | 🔒 D-ENG-01 · D-AUTH-01 · ADR-007 |
| 16 | Common practice: reject unknown request fields (strict schemas) | Unknown members are stripped, so a client-sent price or total is ignored and an old cached app keeps working (CG-API-03) | ⚠️ this guideline — API-DATA-02 only says a client-sent total is "ignored or validated" |
| 17 | Clean Code: "leave the code cleaner than you found it" | Clean-ups go in their own PR (CG-AI-07) | ⚠️ this guideline, within the change size of 🔒 D-PLT-20 |

---

## 26. Open items

Only what the owner or the team still has to choose or verify. Until an item is closed, the stated default applies.

| ID | Item | Who | Default until decided | Affects |
| --- | --- | --- | --- | --- |
| ~~OPEN-CG-01~~ ✅ | **This guideline is approved (v1.0) — owner 02/Oct/2026 13:46 (REC-42 ✅).** The ⚠️ rules are binding; D-ENG-02 in the register is updated. A rule the owner later does not want is marked ✖ with a reason in a new version, not deleted | Owner — done | – | whole file |
| OPEN-CG-02 | **Tool pins — the rule is fixed (CG-DEP-03); the values are verified when the scaffold is built.** npm registry on 02/Oct/2026: `typescript` `latest` = 7.0.2, but `typescript-eslint` 8.71.0 accepts `typescript` `< 6.1.0` → TypeScript **6.0.x** until `typescript-eslint` declares support for 7 · `eslint` `latest` = 10.11.0, but `eslint-plugin-react` 7.37.5 and `eslint-plugin-jsx-a11y` 6.10.2 accept ESLint ≤ 9 → ESLint **9.x**, with `eslint-plugin-import-x` (rules `import-x/…`) in place of `eslint-plugin-import` and the newest `eslint-plugin-unicorn` release that accepts ESLint 9 · `prisma` `latest` = 8.0.0-rc.19 — a release candidate with a different client API (`db.transaction`; no `$transaction` / `$queryRaw`) — and `prev` = 7.10.0 → `prisma` and `@prisma/client` **7.x by exact version**, never `latest` | Team at `add-repo-scaffold` (task 1.2); each row of `VERSIONS.md` marked "verified on <date>"; a later major = its own PR (for Prisma also an ADR — CG-DOC-01) | The pins named here | CG-DEP-03 · CG-DOC-04 · CG-DB-03 · CG-DB-05 · §24 |
| OPEN-CG-03 | **Coverage floors.** 95 % lines / 90 % branches for pure money, time and rule code; 90 % / 85 % for guards and money-module services | Team, then the owner with the approval | The stated numbers | CG-TEST-10 |
| OPEN-CG-04 | **How the `point-barber` pipeline reads `point-sdd`.** `openapi:check` and `spec:trace` compare code with files in `point-sdd`, but CI does not check that repository out (it belongs to another GitHub account, and both repositories are private); the database files are covered by copies with hashes in `db/source/`. Choices: (a) a read-only deploy key or token so CI checks out `point-sdd`; (b) hashed copies of the OpenAPI files and of the change's spec in `point-barber`, as for the database | Owner (repository access) · team, decided when `add-ci-guard-rails` is proposed | The two checks run on the developer's machine against the sibling folder, in the verification group, and are ticked in the PR | CG-API-08 · CG-TEST-07 · CG-AI-05 · §23 · §24 rows 27 and 70 |
| OPEN-CG-05 | **Libraries the sources leave "at build".** Date library (proposed `date-fns` + `@date-fns/tz` — CG-TIME-04), Zod → OpenAPI generator, OpenAPI diff tool, S3 client, image library and Chromium driver (ADR-013 / ADR-014 "pinned at build"), the update bot (Renovate or Dependabot), the secret scanner (`gitleaks`) | Team in the change that first needs each, recorded in `VERSIONS.md` | The proposals named in the rules | CG-TIME-04 · CG-API-08 · CG-DEP-04 · CG-DEP-05 · CG-SEC-05 |
| OPEN-CG-06 | **A GitHub plan that enforces required checks and reviews on private repositories.** Both repositories are private (ADR-016 Decision 8); branch protection on a private repository needs a paid plan. CG-GIT-01, CG-GIT-05 and CG-REVIEW-01 rely on it | Owner | The two developers keep the same rules by hand: no push to `main`, squash merge only, merge only after green CI and the other developer's approval | CG-GIT-01 · CG-GIT-05 · CG-REVIEW-01 · §24 row 74 |

---

## 27. Change log

- **Draft v1.0 — 02/Oct/2026.** First version: 151 rules in 22 areas, the reference mapping (41 rows), the Top 12, the PR Definition of Done, the lint / CI inventory (89 checks) and the override list (17 rows). Built on the owner's decisions of 02/Oct/2026 (🔒 D-ENG-01, D-ENG-02) and aligned with the designs of `add-repo-scaffold`, `add-shared-ui-components`, `add-foundation-auth-access` and `add-walkin-visit-checkout`.
- **v1.0 approved — 02/Oct/2026 13:46.** The owner approved the guideline as it stands (REC-42 ✅): header and status, OPEN-CG-01 closed; no rule text changed.
- **Draft v1.0, review fixes — 02/Oct/2026** (independent review, findings R4-2 … R4-48, R1-6, R3-24 / 25; lead decisions A3, A4, A5, A10, A11, A14). No ID renumbered. 151 rule IDs = 145 rules + 6 pointers (duplicate pairs merged: CG-ERR-04 → CG-I18N-01, CG-SEC-03 → CG-API-03, CG-GIT-06 → CG-SEC-05 / CG-SEC-11, CG-AI-01 → CG-META-03 / CG-META-05, CG-AI-02 → CG-TEST-03, CG-AI-03 → CG-META-04); enforcement: 66 CI · 64 Both · 15 Review; §24 keeps its 89 rows and gains the "Built by" column; §25 keeps 17 rows; §26 has 6 items. One transaction pattern stated in CG-DB-03 (the service opens it; the audit row is written by the runner; a refusal that must be saved is an outcome) and the examples of CG-API-01, CG-DB-06 and CG-IDEM-02 follow it · money typing completed (`moneyFromDb`, the domain type beside the schema, `decimal.js` for rates) · CG-NAME-01 narrowed to D-DB-01 · the strip policy of CG-API-03 marked ⚠️ · the pin rule added to CG-DEP-03 and OPEN-CG-02 (TypeScript 6.0.x, ESLint 9.x with `import-x`, Prisma 7.x) · §24 names the change that builds each check and §23 applies a check from the day it exists · the test-then-merge order of the workflow guide in CG-GIT-05 and §23 · repositories private; OPEN-CG-06 added · "owner D1–D4" replaced by D-ENG-01 / D-ENG-02. Lead alignment after the re-check (same day): CG-GIT-01 names the per-pull-request branch `feature/<change-id>/<part>` · CG-META-04 no longer allows partial apply (same as CG-META-03) · §24 rows 38 and 39 (property-based money tests, `BigInt.prototype.toJSON` guard) are built by `add-ci-guard-rails`. Awaiting owner approval (OPEN-CG-01).

*End of coding guideline — v1.0 (🔒 approved 02/Oct/2026).*
