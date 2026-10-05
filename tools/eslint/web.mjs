// Web lint rules (apps/web, packages/ui, packages/i18n) — owner: Dev 1 (design D3).
// The AD-IMPL-05 guard rails that need no UI library (design D16) and the process.env rule of
// design D19; in every Dev 1 workspace the parseFloat ban (D16). add-shared-ui-components extends
// this file: palette classes, rgb() / hsl() / oklch() literals, `style` colours and the text
// attributes (aria-label, placeholder, title, alt).
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
const HEX_COLOUR =
  'Hex colour — colours come only from packages/ui/tokens.css (CG-UI-05 · AD-IMPL-05 · D-UX-02).';
const ARBITRARY_COLOUR =
  'Arbitrary Tailwind colour class — use a token colour from packages/ui/tokens.css (CG-UI-05 · AD-IMPL-05).';
const PARSE_FLOAT =
  'parseFloat — money is an integer number of kyats and is never parsed as a float (CG-MONEY-01 · AD-IMPL-05 · D-PLT-04).';

// #rgb, #rgba, #rrggbb, #rrggbbaa — not inside a word (`href#add`) or an HTML entity (`&#123;`).
const HEX = String.raw`(?<![\w&])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![\w-])`;
// A colour utility with an arbitrary colour value: `bg-[rgb(…)]`, `text-[color:var(--x)]`.
// `bg-[#…]` is reported by the hex rule.
const ARBITRARY = String.raw`(?:^|[\s:!])(?:bg|text|border(?:-[xytrblse])?|outline|ring(?:-offset)?|fill|stroke|from|via|to|decoration|shadow|accent|caret|divide|placeholder)-\[(?:(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(|color:)`;

const JSX_CHILD = ':matches(JSXElement, JSXFragment) > JSXExpressionContainer';

export default [
  {
    files: WEB_SOURCE,
    plugins: { n },
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: String.raw`JSXText[value=/\S/]`, message: RAW_TEXT },
        { selector: String.raw`${JSX_CHILD} > Literal[value=/\S/]`, message: RAW_TEXT },
        {
          selector: String.raw`${JSX_CHILD} > TemplateLiteral > TemplateElement[value.raw=/\S/]`,
          message: RAW_TEXT,
        },
        { selector: `Literal[value=/${HEX}/i]`, message: HEX_COLOUR },
        { selector: `TemplateElement[value.raw=/${HEX}/i]`, message: HEX_COLOUR },
        { selector: `Literal[value=/${ARBITRARY}/]`, message: ARBITRARY_COLOUR },
        { selector: `TemplateElement[value.raw=/${ARBITRARY}/]`, message: ARBITRARY_COLOUR },
      ],
      // CG-SEC-05: the web app reads its environment only through apps/web/env.ts.
      'n/no-process-env': 'error',
    },
  },
  {
    files: DEV1_WORKSPACES,
    rules: {
      'no-restricted-globals': ['error', { name: 'parseFloat', message: PARSE_FLOAT }],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: PARSE_FLOAT },
      ],
    },
  },
  {
    // The one reader of process.env in the web app, and config files (design D19).
    files: ['apps/web/env.ts', 'apps/web/*.config.{ts,mts,js,mjs}'],
    rules: { 'n/no-process-env': 'off' },
  },
];
