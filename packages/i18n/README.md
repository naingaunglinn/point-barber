# @point/i18n

Language files for the web app — AD-IMPL-03 · D-PLT-03.

Empty after `add-repo-scaffold`. Filled by **`add-shared-ui-components`** with the `my` and `en`
language files, read through `next-intl`. Every string a person can see comes from these files
(CG-I18N-01, AD-L10N-01); both languages have the same key set (CG-I18N-02).

Until then the web app shows no literal UI text — the placeholder pages render only expressions,
and `tools/eslint/web.mjs` fails on raw JSX text.
