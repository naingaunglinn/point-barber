'use client';

import { cn } from 'cn';
import { useTranslations } from 'next-intl';

import { DemoTitleProvider } from './demo-title';
import { anchorOf, MANIFEST } from './manifest';
import type { CatalogueSectionId } from './sections';

// One section of the catalogue rendered from the manifest (design D12): per component its name, its
// rule IDs and its demos; each component has an anchor (`/dev/ui#money-input`) and each demo root the
// test id `demo-<name>-<id>`.
export function SectionDemos({ section }: { readonly section: CatalogueSectionId }) {
  const t = useTranslations('devui');
  const entries = MANIFEST.filter((entry) => entry.section === section);
  return (
    <div className="grid gap-x-4 gap-y-8 lg:grid-cols-2">
      {entries.map((entry) => {
        // An entry with one ordinary demo takes one column; several demos or a wide one take the row.
        const full = entry.demos.length > 1 || entry.demos.some((demo) => demo.wide);
        return (
          <article
            key={entry.name}
            id={anchorOf(entry.name)}
            aria-labelledby={`${anchorOf(entry.name)}-title`}
            className={cn('flex min-w-0 flex-col gap-3', full && 'lg:col-span-2')}
          >
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 id={`${anchorOf(entry.name)}-title`} className="text-lg font-semibold" lang="en">
                <code>{entry.name}</code>
              </h3>
              <p className="text-xs text-muted-foreground" lang="en">
                {entry.rules.join(' · ')}
              </p>
            </header>
            <div className={cn('grid gap-4', full && 'lg:grid-cols-2')}>
              {entry.demos.map(({ id, title, Demo, wide, bleed }) => (
                <div
                  key={id}
                  data-testid={`demo-${entry.name}-${id}`}
                  className={cn(
                    'flex min-w-0 flex-col gap-3 rounded-lg border border-border',
                    wide && 'lg:col-span-2',
                    // The shell runs edge to edge, so it keeps the width it is tested at.
                    bleed ? 'pt-4' : 'p-4',
                  )}
                >
                  <h4
                    id={`demo-${entry.name}-${id}-title`}
                    className={cn('text-sm font-semibold text-muted-foreground', bleed && 'px-4')}
                  >
                    {t(`demo.${title}`)}
                  </h4>
                  <DemoTitleProvider value={`demo-${entry.name}-${id}-title`}>
                    <Demo />
                  </DemoTitleProvider>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
