import { hasMyanmarScript } from '@point/shared';

// A data value on screen — a name, a bilingual field through its fallback, free text (AD-L10N-04 ·
// AD-A11Y-06 · design D10). A value with a character of U+1000–U+109F is marked `lang="my"`, so it
// gets the Myanmar font stack and line-height in the English UI too. Shared components show data
// through it; labels come from the language files and need no marking.
export function DataText({ children }: Readonly<{ children: string }>) {
  return hasMyanmarScript(children) ? <span lang="my">{children}</span> : <span>{children}</span>;
}
