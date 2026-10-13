# @point/i18n

Language files for the web app — AD-IMPL-03 · D-PLT-03 · design D6 of `add-shared-ui-components`.

`messages/<my|en>/<namespace>.json`, one file per namespace: `common`, `status`, `error`, `reason`,
`devui` (catalogue labels — tool texts, not product copy). Feature changes add their own namespace files
and their `status.*` / `error.*` / `reason.*` keys. Every string a person can see comes from these files
(CG-I18N-01, AD-L10N-01); both languages have the same key set and no empty value — `pnpm i18n:check`.

| File                    | Holds                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `src/config.ts`         | `LOCALES` (`my`, `en`), `DEFAULT_LOCALE` `my`, `NAMESPACES`                                    |
| `src/messages.ts`       | `loadMessages(locale)` — the namespace files of one language                                   |
| `src/resolve-locale.ts` | `resolveLocale` (account → system default; cookie `point_locale` before a session), the cookie |
| `src/keys.d.ts`         | Typed keys: a key that is not in the English files fails `tsc`                                 |
| `src/request.ts`        | The next-intl request config of the staff tree (time zone `Asia/Yangon`); not wired yet        |

- **No workspace dependency** (design D1). `@point/shared` depends on this package for the formatter
  words `common.format.*` — the only link between the two.
- **`next-intl` and `next` are dev dependencies here**: `apps/web` and `packages/ui` bring their own.
  The API reads only the JSON files (through `@point/shared`), so its image gets no Next.js.
- `src/request.ts` is not wired yet: the catalogue passes the locale and the messages to its provider
  itself. The first staff screen (`add-foundation-auth-access`) wires it with the next-intl plugin.
- `common.format.unit.kyat` and `unit.lakh` are Myanmar words; the brief marks their English value "not
  used". The English files repeat the Myanmar text to keep the key sets equal, and the formatters ignore it.

Run: `pnpm --filter @point/i18n typecheck` · `pnpm i18n:check`.
