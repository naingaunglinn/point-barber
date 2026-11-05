// Web lint rules (apps/web, packages/ui, packages/i18n) — owner: Dev 1 (design D3).
// The AD-IMPL-05 guard rails that need no UI library (design D16); in every Dev 1 workspace the
// parseFloat ban (D16) and the process.env rule of design D19. add-shared-ui-components (design D14)
// extends it: the text attributes (aria-label, placeholder, title, alt) and the allowed punctuation;
// Tailwind palette classes, rgb() / hsl() / oklch() literals, `style` colours and `fontFamily`.
// One `no-restricted-syntax` entry holds every selector: a later config object for the same files
// would replace it, not add to it.
import n from 'eslint-plugin-n';
import pluginQuery from '@tanstack/eslint-plugin-query';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';

import point from '../eslint-plugin-point/index.mjs';

const WEB_SOURCE = [
  'apps/web/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  'packages/ui/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
];
const DEV1_WORKSPACES = [...WEB_SOURCE, 'packages/i18n/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];
/** apps/web and every package (design D14 row 37); apps/api is enabled by add-walkin-visit-checkout. */
const MONEY_SCOPE = ['apps/web/**/*.{ts,tsx,mts,cts}', 'packages/*/**/*.{ts,tsx,mts,cts}'];

const RAW_TEXT =
  'Raw UI text in JSX — every visible string comes from the my / en language files (CG-I18N-01 · AD-L10N-01 · D-PLT-03).';
const RAW_ATTRIBUTE =
  'Raw UI text in aria-label / placeholder / title / alt — use a language key (CG-I18N-01 · AD-L10N-01 · D-PLT-03).';
const HEX_COLOUR =
  'Hex colour — colours come only from packages/ui/tokens.css (CG-UI-05 · AD-IMPL-05 · D-UX-02).';
const ARBITRARY_COLOUR =
  'Arbitrary Tailwind colour class — use a token colour from packages/ui/tokens.css (CG-UI-05 · AD-IMPL-05).';
const PALETTE_COLOUR =
  'Tailwind palette colour class — use a token colour from packages/ui/tokens.css (CG-UI-05 · AD-VIS-01 · AD-IMPL-05).';
const COLOUR_FUNCTION =
  'rgb() / hsl() / oklch() colour — colours come only from packages/ui/tokens.css (CG-UI-05 · AD-VIS-01 · AD-IMPL-05).';
const STYLE_COLOUR =
  'Colour in `style` — use a token (`var(--…)`) from packages/ui/tokens.css (CG-UI-05 · AD-VIS-01 · AD-IMPL-05).';
const STYLE_FONT =
  '`fontFamily` in `style` — fonts are set only in packages/ui/tokens.css (CG-UI-05 · AD-VIS-01 · D-UX-02).';
const RADIX_IMPORT =
  'Radix primitive outside packages/ui — screens use the shared components of @point/ui (AD-IMPL-02 · CG-UI-04).';
const FORM_ELEMENT =
  'Raw form element outside packages/ui — use the shared component (Button, TextInput, MoneyInput …) of @point/ui (AD-IMPL-02 · CG-UI-04).';
const SECOND_LIBRARY =
  'Second library — HTTP goes through the one API client, forms use React Hook Form + Zod, server state lives in TanStack Query (CG-UI-03 · CG-UI-06 · CG-UI-07).';
const INLINE_QUERY_KEY =
  "Inline `queryKey` array — take the key from the module's key factory (`*.keys.ts`) (CG-UI-07).";
const ON_MUTATE =
  '`onMutate` — nothing about money or status is shown as done before the server says so; optimistic updates only in the allow-listed files (CG-UI-08).';
const FETCH =
  '`fetch` in a component, hook or packages/ui — all HTTP goes through the one typed API client (CG-UI-03 · ADR-009).';
const PARSE_FLOAT =
  'parseFloat — money is an integer number of kyats and is never parsed as a float (CG-MONEY-01 · AD-IMPL-05 · D-PLT-04).';

// Text that is not only whitespace and the punctuation design D14 allows as a literal: · — ＋ * ▲ ▼.
const WORDS = String.raw`[^\s·—＋*▲▼]`;
// #rgb, #rgba, #rrggbb, #rrggbbaa — not inside a word (`href#add`) or an HTML entity (`&#123;`).
const HEX = String.raw`(?<![\w&])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![\w-])`;
// A colour utility with an arbitrary colour value: `bg-[rgb(…)]`, `text-[color:var(--x)]`.
// `bg-[#…]` is reported by the hex rule.
const UTILITY = String.raw`(?:bg|text|border(?:-[xytrblse])?|outline|ring(?:-offset)?|fill|stroke|from|via|to|decoration|shadow|accent|caret|divide|placeholder)`;
const ARBITRARY = String.raw`(?:^|[\s:!])${UTILITY}-\[(?:(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(|color:)`;
// A Tailwind palette colour: `bg-blue-500`, `text-white`, `hover:border-red-600/50`.
const PALETTE = String.raw`(?:^|[\s:!])${UTILITY}-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950))(?:\/\d+)?(?![\w-])`;
// A CSS colour function written in code.
// (`bg-[rgb(…)]` is reported once, by the arbitrary-class rule.)
const FUNCTION = String.raw`(?<!\[)\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(`;

const JSX_CHILD = ':matches(JSXElement, JSXFragment) > JSXExpressionContainer';
const TEXT_ATTRIBUTE = 'JSXAttribute[name.name=/^(aria-label|placeholder|title|alt)$/]';
const STYLE = "JSXAttribute[name.name='style']";
const COLOUR_PROPERTY = String.raw`Property[key.name=/(^c|C)olor$|^background$|^fill$|^stroke$/]`;

/** Literal UI text in JSX children and text attributes (11.1). */
const TEXT_RULES = [
  { selector: `JSXText[value=/${WORDS}/]`, message: RAW_TEXT },
  { selector: `${JSX_CHILD} > Literal[value=/${WORDS}/]`, message: RAW_TEXT },
  {
    selector: `${JSX_CHILD} > TemplateLiteral > TemplateElement[value.raw=/${WORDS}/]`,
    message: RAW_TEXT,
  },
  { selector: `${TEXT_ATTRIBUTE} > Literal[value=/${WORDS}/]`, message: RAW_ATTRIBUTE },
  {
    selector: `${TEXT_ATTRIBUTE} > JSXExpressionContainer > Literal[value=/${WORDS}/]`,
    message: RAW_ATTRIBUTE,
  },
  {
    selector: `${TEXT_ATTRIBUTE} > JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw=/${WORDS}/]`,
    message: RAW_ATTRIBUTE,
  },
];

/** Colours and fonts outside the token file (11.2). */
const COLOUR_RULES = [
  { selector: `Literal[value=/${HEX}/i]`, message: HEX_COLOUR },
  { selector: `TemplateElement[value.raw=/${HEX}/i]`, message: HEX_COLOUR },
  { selector: `Literal[value=/${ARBITRARY}/]`, message: ARBITRARY_COLOUR },
  { selector: `TemplateElement[value.raw=/${ARBITRARY}/]`, message: ARBITRARY_COLOUR },
  { selector: `Literal[value=/${PALETTE}/]`, message: PALETTE_COLOUR },
  { selector: `TemplateElement[value.raw=/${PALETTE}/]`, message: PALETTE_COLOUR },
  {
    selector: String.raw`${STYLE} ${COLOUR_PROPERTY} > Literal[value!=/^var\(--/]`,
    message: STYLE_COLOUR,
  },
  { selector: `${STYLE} ${COLOUR_PROPERTY} > TemplateLiteral`, message: STYLE_COLOUR },
  { selector: `${STYLE} Property[key.name='fontFamily']`, message: STYLE_FONT },
];

/** CSS colour functions in code (11.2) — not in the two files whose job is to read token values. */
const FUNCTION_RULES = [
  { selector: `Literal[value=/${FUNCTION}/i]`, message: COLOUR_FUNCTION },
  { selector: `TemplateElement[value.raw=/${FUNCTION}/i]`, message: COLOUR_FUNCTION },
];

/** Radix only inside packages/ui (11.8): the `@radix-ui/*` packages and the `radix-ui` umbrella. */
const RADIX_RULES = [
  {
    selector: String.raw`ImportDeclaration[source.value=/^(@radix-ui\/|radix-ui(\/|$))/]`,
    message: RADIX_IMPORT,
  },
  {
    selector: String.raw`ImportExpression[source.value=/^(@radix-ui\/|radix-ui(\/|$))/]`,
    message: RADIX_IMPORT,
  },
];

/** Web data rules (11.10 · design D14 rows 59, 62, 63). */
const LIBRARY = String.raw`^(axios|formik|yup|joi|redux|@reduxjs\/toolkit|react-redux|zustand|jotai|swr)(\/|$)`;
const DATA_RULES = [
  { selector: `ImportDeclaration[source.value=/${LIBRARY}/]`, message: SECOND_LIBRARY },
  { selector: `ImportExpression[source.value=/${LIBRARY}/]`, message: SECOND_LIBRARY },
  { selector: "Property[key.name='onMutate']", message: ON_MUTATE },
];
const QUERY_KEY_RULES = [
  { selector: "Property[key.name='queryKey'] > ArrayExpression", message: INLINE_QUERY_KEY },
];

/**
 * Files that may update optimistically (CG-UI-08: trivial, reversible UI state — notification read, panel
 * collapsed, column settings). None yet; the change that adds one lists it here.
 */
const ON_MUTATE_ALLOWED = [];

/** One `no-restricted-syntax` list for a set of files — a later object replaces the whole rule. */
function syntax({ functions = true, radix = false, queryKey = true, onMutate = false } = {}) {
  return [
    'error',
    ...TEXT_RULES,
    ...COLOUR_RULES,
    ...(functions ? FUNCTION_RULES : []),
    ...(onMutate ? DATA_RULES.filter((rule) => rule.message !== ON_MUTATE) : DATA_RULES),
    ...(queryKey ? QUERY_KEY_RULES : []),
    ...(radix ? RADIX_RULES : []),
  ];
}

const APP_WEB = 'apps/web/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const KEY_FACTORIES = '**/*.keys.{ts,tsx}';

/** The token file's own test and the catalogue's token table compare and print computed values. */
const TOKEN_READERS = [
  'packages/ui/src/tokens.test.ts',
  'packages/ui/src/catalogue/demos/tokens-section.tsx',
];

export default [
  { files: WEB_SOURCE, rules: { 'no-restricted-syntax': syntax() } },
  {
    // Outside packages/ui the screens use the shared components (AD-IMPL-02 · design D14 row 60): no
    // Radix import and no raw form element.
    files: [APP_WEB],
    plugins: { react },
    rules: {
      'no-restricted-syntax': syntax({ radix: true }),
      'react/forbid-elements': [
        'error',
        {
          forbid: ['button', 'input', 'select', 'textarea'].map((element) => ({
            element,
            message: FORM_ELEMENT,
          })),
        },
      ],
    },
  },
  // The key factories build query keys (CG-UI-07).
  {
    files: [`packages/ui/${KEY_FACTORIES}`],
    rules: { 'no-restricted-syntax': syntax({ queryKey: false }) },
  },
  {
    files: [`apps/web/${KEY_FACTORIES}`],
    rules: { 'no-restricted-syntax': syntax({ queryKey: false, radix: true }) },
  },
  ...(ON_MUTATE_ALLOWED.length === 0
    ? []
    : [
        { files: ON_MUTATE_ALLOWED, rules: { 'no-restricted-syntax': syntax({ onMutate: true }) } },
      ]),
  // The token readers may print colour functions.
  { files: TOKEN_READERS, rules: { 'no-restricted-syntax': syntax({ functions: false }) } },
  {
    // Accessibility checked statically (AD-A11Y-01 · CG-UI-10 · design D14 row 65); axe runs on the
    // catalogue in CI.
    ...jsxA11y.flatConfigs.recommended,
    files: WEB_SOURCE,
  },
  // TanStack Query's recommended rules (CG-UI-07 · design D14 row 62).
  ...pluginQuery.configs['flat/recommended'].map((config) => ({ ...config, files: WEB_SOURCE })),
  {
    files: DEV1_WORKSPACES,
    plugins: { n },
    rules: {
      'no-restricted-globals': ['error', { name: 'parseFloat', message: PARSE_FLOAT }],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: PARSE_FLOAT },
      ],
      // CG-SEC-05: the web app reads its environment only through apps/web/env.ts; packages/ui
      // and packages/i18n read none.
      'n/no-process-env': 'error',
    },
  },
  {
    // No `fetch` in packages/ui and in the components and hooks of apps/web (CG-UI-03); the API client
    // module uses it. One list with the parseFloat ban — a later object replaces the rule.
    files: [
      'packages/ui/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'apps/web/**/*.{tsx,jsx}',
      'apps/web/**/use-*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: PARSE_FLOAT },
        { name: 'fetch', message: FETCH },
      ],
    },
  },
  {
    // Money only through the helpers of packages/shared/src/money (CG-MONEY-03 · design D14).
    files: MONEY_SCOPE,
    ignores: ['packages/shared/src/money/**'],
    plugins: { point },
    rules: { 'point/no-number-money': 'error' },
  },
  {
    // Dates, times and numbers only through the shared formatter (AD-FMT-00 · design D14 row 44).
    files: MONEY_SCOPE,
    ignores: ['packages/shared/src/format/**'],
    plugins: { point },
    rules: { 'point/no-locale-format': 'error' },
  },
  {
    // The supplied clock and the Asia/Yangon zone (D-PLT-15 · CG-TIME-03 / 04 · design D14 rows 42 / 43).
    files: MONEY_SCOPE,
    plugins: { point },
    rules: { 'point/no-device-clock': 'error' },
  },
  {
    // ClockProvider is where the device clock is read once, to advance the supplied instant.
    files: ['packages/ui/src/providers/clock.tsx'],
    rules: { 'point/no-device-clock': ['error', { clock: false }] },
  },
  {
    // The time and format helpers work in Asia/Yangon explicitly.
    files: ['packages/shared/src/time/**', 'packages/shared/src/format/**'],
    rules: { 'point/no-device-clock': ['error', { localTime: false }] },
  },
  {
    // Status codes by their named constants (D-DB-03 · AD-IMPL-04 · design D14 row 7).
    files: WEB_SOURCE,
    plugins: { point },
    rules: { 'point/no-raw-status': 'error' },
  },
  {
    // The one reader of process.env in the web app, config files (design D19), and the build step
    // that turns the catalogue flag into a constant — the flag's only read, moved there from env.ts so
    // that no run-time environment can open /dev/ui (add-shared-ui-components design D12).
    files: [
      'apps/web/env.ts',
      'apps/web/*.config.{ts,mts,js,mjs}',
      'apps/web/scripts/write-catalogue-flag.mjs',
    ],
    rules: { 'n/no-process-env': 'off' },
  },
];
