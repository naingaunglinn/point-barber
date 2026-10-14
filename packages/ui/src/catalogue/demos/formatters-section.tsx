'use client';

import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

import { LOCALES } from '@point/i18n';
import { hasMyanmarScript } from '@point/shared';

import { useNow } from '../../providers/clock';
import { FORMATTER_ROWS } from '../formatter-rows';

// The Formatters section of the catalogue (task 4.6 · AD-FMT-00..11 · design D5): input → output for
// every function of D5, in both languages, at the catalogue clock. A table from 768 px; below, one
// entry per row, so nothing scrolls sideways (AD-LIST-02 — a region that scrolls needs keyboard access).
/** An input in Myanmar script (a name, Myanmar digits) is marked as Myanmar text (AD-L10N-04). */
const langOf = (input: string) => (hasMyanmarScript(input) ? 'my' : undefined);

export function FormattersSection() {
  const t = useTranslations('devui');
  const now = useNow();
  return (
    <>
      <ul className="flex flex-col text-sm md:hidden">
        {FORMATTER_ROWS.map((row) => (
          <li
            key={`${row.fn}-${row.input}`}
            className="flex flex-col gap-1 border-b border-border py-2"
          >
            <p className="flex flex-wrap gap-x-3">
              <code className="font-semibold" lang="en">
                {row.fn}
              </code>
              <code className="min-w-0 break-words text-muted-foreground" lang={langOf(row.input)}>
                {row.input}
              </code>
            </p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
              {LOCALES.map((locale) => (
                <Fragment key={locale}>
                  <dt className="font-semibold">{t(`language.${locale}`)}</dt>
                  <dd lang={locale}>{row.run(locale, now)}</dd>
                </Fragment>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm" data-testid="formatters">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4">{t('formatters.function')}</th>
              <th className="py-2 pr-4">{t('formatters.input')}</th>
              {LOCALES.map((locale) => (
                <th key={locale} className="py-2 pr-4">
                  {t(`language.${locale}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FORMATTER_ROWS.map((row) => (
              <tr
                key={`${row.fn}-${row.input}`}
                className="border-b border-border"
                data-fn={row.fn}
              >
                <td className="py-2 pr-4" lang="en">
                  <code>{row.fn}</code>
                </td>
                <td className="py-2 pr-4">
                  <code lang={langOf(row.input)}>{row.input}</code>
                </td>
                {LOCALES.map((locale) => (
                  <td key={locale} lang={locale} className="py-2 pr-4" data-output={locale}>
                    {row.run(locale, now)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
