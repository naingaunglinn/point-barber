// Web lint rules (apps/web, packages/ui, packages/i18n) — owner: Dev 1 (design D3).
// The AD-IMPL-05 guard rails that need no UI library (design D16); in every Dev 1 workspace the
// parseFloat ban (D16) and the process.env rule of design D19. add-shared-ui-components (design D14)
// extends it: the text attributes (aria-label, placeholder, title, alt) and the allowed punctuation;
// Tailwind palette classes, rgb() / hsl() / oklch() literals, `style` colours and `fontFamily`.
// One `no-restricted-syntax` entry holds every selector: a later config object for the same files
// would replace it, not add to it.
import n from 'eslint-plugin-n';

const WEB_SOURCE = [
  'apps/web/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  'packages/ui/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
];
const DEV1_WORKSPACES = [...WEB_SOURCE, 'packages/i18n/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];

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

/** The token file's own test and the catalogue's token table compare and print computed values. */
const TOKEN_READERS = [
  'packages/ui/src/tokens.test.ts',
  'packages/ui/src/catalogue/demos/tokens-section.tsx',
];

export default [
  {
    files: WEB_SOURCE,
    rules: {
      'no-restricted-syntax': ['error', ...TEXT_RULES, ...COLOUR_RULES, ...FUNCTION_RULES],
    },
  },
  {
    // The same list without the colour functions (a later object replaces the rule — see the top).
    files: TOKEN_READERS,
    rules: { 'no-restricted-syntax': ['error', ...TEXT_RULES, ...COLOUR_RULES] },
  },
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
