'use client';

import { cn } from 'cn';
import { useTranslations } from 'next-intl';

import { anchorOf, MANIFEST } from './manifest';
import type { CatalogueSectionId } from './sections';

// One section of the catalogue rendered from the manifest (design D12): per component its name, its
// rule IDs and its demos; each component has an anchor (`/dev/ui#money-input`) and each demo root the
// test id `demo-<name>-<id>`.
export function SectionDemos({ section }: { readonly section: CatalogueSectionId }) {
  const t = useTranslations('devui');
  const entries = MANIFEST.filter((entry) => entry.section === section);
  return (
    <div className="flex flex-col gap-8">
      {entries.map((entry) => (
        <article
          key={entry.name}
          id={anchorOf(entry.name)}
          aria-labelledby={`${anchorOf(entry.name)}-title`}
          className="flex flex-col gap-3"
        >
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 id={`${anchorOf(entry.name)}-title`} className="text-lg font-semibold" lang="en">
              <code>{entry.name}</code>
            </h3>
            <p className="text-xs text-muted-foreground" lang="en">
              {entry.rules.join(' · ')}
            </p>
          </header>
          <div className="grid gap-4 lg:grid-cols-2">
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
                <h4 className={cn('text-sm font-semibold text-muted-foreground', bleed && 'px-4')}>
                  {t(`demo.${title}`)}
                </h4>
                <Demo />
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
