// The fonts each root layout preloads: only the ones used above the fold in the current language
// (FE-PERF-06 · design D3). The URLs are the `src` of the @font-face rules in tokens.css; the web
// app serves packages/ui/fonts at /fonts/.

export type Tree = 'staff' | 'site';
export type Locale = 'my' | 'en';

export interface FontPreload {
  readonly href: string;
  readonly type: 'font/woff2';
}

const PYIDAUNGSU = ['/fonts/pyidaungsu-regular.woff2', '/fonts/pyidaungsu-bold.woff2'] as const;

const PRELOADS: Readonly<Record<Tree, Readonly<Record<Locale, readonly string[]>>>> = {
  staff: { en: ['/fonts/manrope-latin.woff2', '/fonts/inter-latin.woff2'], my: PYIDAUNGSU },
  site: { en: ['/fonts/archivo-black-latin.woff2', '/fonts/roboto-latin.woff2'], my: PYIDAUNGSU },
};

/** The `<link rel="preload" as="font">` entries of a tree in a language. */
export function fontPreloads(tree: Tree, locale: Locale): readonly FontPreload[] {
  return PRELOADS[tree][locale].map((href) => ({ href, type: 'font/woff2' }));
}
