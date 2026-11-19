'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { groupDigits, localized, moneyFromWire } from '@point/shared';

import type { Locale, Tree } from '../../fonts';
import {
  MYANMAR_DIGITS,
  MYANMAR_TEST_STRINGS,
  TABULAR_AMOUNTS,
  TABULAR_WIDTH_PAIR,
} from '../font-samples';
import { COMPANY } from '../fixtures';

// The Fonts section of the catalogue (task 4.5 · AD-VIS-05 · FE-VIS-02 · design D3): the Myanmar test
// strings at 400 and 700 next to the device font, the font faces the page has loaded, the tabular
// money column, the Myanmar digits and the site display heading.

interface Face {
  readonly family: string;
  readonly weight: string;
  readonly status: FontFaceLoadStatus;
}

function facesOf(fonts: FontFaceSet): readonly Face[] {
  const faces: Face[] = [];
  fonts.forEach((face) =>
    faces.push({
      family: face.family.replace(/^["']|["']$/g, ''),
      weight: face.weight,
      status: face.status,
    }),
  );
  return faces;
}

export function FontsSection({ tree, lang }: Readonly<{ tree: Tree; lang: Locale }>) {
  const t = useTranslations('devui');
  const [faces, setFaces] = useState<readonly Face[]>([]);

  useEffect(() => {
    const fonts = document.fonts;
    const update = () => setFaces(facesOf(fonts));
    fonts.addEventListener('loadingdone', update);
    void fonts.ready.then(update);
    return () => fonts.removeEventListener('loadingdone', update);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-2 text-lg font-bold">{t('fonts.samples')}</h3>
        <ul className="flex flex-col gap-3">
          {MYANMAR_TEST_STRINGS.map((text, index) => (
            <li key={text} className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span lang="my" className="font-normal" data-testid={`font-sample-${index}-400`}>
                {text}
              </span>
              <span lang="my" className="font-bold" data-testid={`font-sample-${index}-700`}>
                {text}
              </span>
              <span
                lang="my"
                className="font-system-ui text-muted-foreground"
                data-testid={`font-sample-${index}-system`}
              >
                {text}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">{t('fonts.legend')}</p>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-bold">{t('fonts.semibold')}</h3>
        <span lang="my" className="font-semibold" data-testid="font-semibold-my">
          {MYANMAR_TEST_STRINGS[2]}
        </span>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-bold">{t('fonts.tabular')}</h3>
        <div className="inline-flex flex-col items-end font-numeric" data-testid="tabular-column">
          {TABULAR_AMOUNTS.map((amount) => (
            <span key={amount}>{groupDigits(moneyFromWire(amount))}</span>
          ))}
        </div>
        <div className="mt-2 flex flex-col items-start font-numeric">
          {TABULAR_WIDTH_PAIR.map((digits) => (
            <span key={digits} data-testid={`tabular-${digits}`}>
              {digits}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-bold">{t('fonts.digits')}</h3>
        <div className="flex flex-wrap items-baseline gap-x-6">
          <span lang="my" data-testid="digits-pyidaungsu">
            {MYANMAR_DIGITS}
          </span>
          <span
            lang="my"
            className="font-system-ui text-muted-foreground"
            data-testid="digits-system"
          >
            {MYANMAR_DIGITS}
          </span>
        </div>
      </div>

      {tree === 'site' ? (
        <div>
          <h3 className="mb-2 text-lg font-bold">{t('fonts.siteHeadings')}</h3>
          <p
            className={`font-display text-3xl ${lang === 'my' ? 'font-bold' : 'font-normal'}`}
            data-testid="site-display-heading"
          >
            {localized(COMPANY, 'name', lang)}
          </p>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-lg font-bold">{t('fonts.faces')}</h3>
        <div className="overflow-x-auto">
          <table className="text-left text-sm" data-testid="font-faces">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4">{t('fonts.family')}</th>
                <th className="py-2 pr-4">{t('fonts.weightColumn')}</th>
                <th className="py-2">{t('fonts.status')}</th>
              </tr>
            </thead>
            <tbody>
              {faces.map((face) => (
                <tr
                  key={`${face.family}-${face.weight}`}
                  data-family={face.family}
                  data-weight={face.weight}
                  data-status={face.status}
                  className="border-b border-border"
                >
                  <td className="py-2 pr-4">{face.family}</td>
                  <td className="py-2 pr-4 font-numeric">{face.weight}</td>
                  <td className="py-2">{face.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
