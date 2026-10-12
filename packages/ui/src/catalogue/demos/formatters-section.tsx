'use client';

import { useTranslations } from 'next-intl';

import { LOCALES } from '@point/i18n';

import { useNow } from '../../providers/clock';
import { FORMATTER_ROWS } from '../formatter-rows';

// The Formatters section of the catalogue (task 4.6 · AD-FMT-00..11 · design D5): input → output for
// every function of D5, in both languages, at the catalogue clock.
export function FormattersSection() {
  const t = useTranslations('devui');
  const now = useNow();
  return (
    <div className="overflow-x-auto">
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
            <tr key={`${row.fn}-${row.input}`} className="border-b border-border" data-fn={row.fn}>
              <td className="py-2 pr-4" lang="en">
                <code>{row.fn}</code>
              </td>
              <td className="py-2 pr-4">
                <code>{row.input}</code>
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
  );
}
