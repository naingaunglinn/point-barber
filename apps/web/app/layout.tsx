import type { ReactNode } from 'react';

// Root layout of both route trees. No metadata, font or stylesheet yet: titles are UI text from the
// language files and fonts come from the tokens, both with add-shared-ui-components (D-PLT-03 ·
// CG-UI-05). There is no locale segment yet (design D11), so `lang` is the default UI language —
// `system.default_language` 1 = MY (API Part 1) — as FE-A11Y-02 asks.
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="my">
      <body>{children}</body>
    </html>
  );
}
