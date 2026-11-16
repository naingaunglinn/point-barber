import { vi } from 'vitest';

// A viewport width for the screens whose shared components switch layout with `useMinWidth` (DataTable:
// the table from 768 px, the cards below — AD-LIST-02); jsdom has no matchMedia. As
// packages/ui/src/test/viewport.ts.
export function mockViewport(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      matches: width >= min,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList;
  });
}
