'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type CSSProperties } from 'react';

import type { Tree } from '../../fonts';
import {
  CONTRAST_PAIRS,
  contrastRatio,
  markOf,
  type ContrastMark,
  type ContrastPair,
  type Rgb,
} from '../contrast';
import { ALIASES, PENDING_OWNER_VALUE, SITE_ONLY_TOKENS, swatchTokens } from '../swatches';

// The Tokens section of the catalogue (task 4.4 · AD-VIS-01 · AD-VIS-03 · AD-VIS-04 · FE-VIS-01a ·
// FE-VIS-01b · design D2): every colour token with its alias note, and the contrast table of the tree,
// both read from the colours the browser resolves — never from a copy of the values.

type Token = `--${string}`;

/** The tokens' colours in this tree as 8-bit sRGB, drawn on a 1 × 1 canvas. */
function resolveColours(tokens: readonly Token[]): ReadonlyMap<Token, Rgb> {
  const probe = document.createElement('span');
  document.body.append(probe);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const colours = new Map<Token, Rgb>();
  for (const token of context === null ? [] : tokens) {
    probe.style.color = `var(${token})`;
    context?.clearRect(0, 0, 1, 1);
    if (context !== null) {
      context.fillStyle = getComputedStyle(probe).color;
      context.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
      colours.set(token, [red, green, blue]);
    }
  }
  probe.remove();
  return colours;
}

const rgbText = ([red, green, blue]: Rgb) => `rgb(${red}, ${green}, ${blue})`;

const MARK_KEY = {
  pass: 'tokens.markPass',
  largeOnly: 'tokens.markLargeOnly',
  notAllowed: 'tokens.markNotAllowed',
  fail: 'tokens.markFail',
} as const satisfies Record<ContrastMark, string>;

export function TokensSection({ tree }: Readonly<{ tree: Tree }>) {
  const t = useTranslations('devui');
  const tokens = swatchTokens(tree);
  const [colours, setColours] = useState<ReadonlyMap<Token, Rgb> | null>(null);

  useEffect(() => {
    setColours(resolveColours(swatchTokens(tree)));
  }, [tree]);

  const subject = (pair: ContrastPair) => {
    if (pair.kind === 'outline') return t('tokens.focusOutline', { token: pair.via ?? '' });
    if (pair.kind === 'border') return t('tokens.inputBorder', { token: pair.via ?? '' });
    return pair.foreground;
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-2 text-lg font-bold">{t('tokens.swatches')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4">{t('tokens.token')}</th>
                <th className="py-2 pr-4">{t('tokens.sample')}</th>
                <th className="py-2 pr-4">{t('tokens.value')}</th>
                <th className="py-2">{t('tokens.note')}</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => {
                const alias = ALIASES[tree][token];
                const colour = colours?.get(token);
                return (
                  <tr
                    key={token}
                    data-testid={`token-${token.slice(2)}`}
                    data-value={colour === undefined ? undefined : rgbText(colour)}
                    className="border-b border-border"
                  >
                    <td className="py-2 pr-4" lang="en">
                      <code>{token}</code>
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className="inline-block size-6 rounded-sm border border-border bg-[var(--swatch)]"
                        style={{ '--swatch': `var(${token})` } as CSSProperties}
                      />
                    </td>
                    <td className="py-2 pr-4 font-numeric">
                      {colour === undefined ? t('tokens.measuring') : rgbText(colour)}
                    </td>
                    <td className="py-2">
                      <ul>
                        {alias === undefined ? null : (
                          <li>{t('tokens.aliasOf', { token: alias })}</li>
                        )}
                        {tree === 'staff' && PENDING_OWNER_VALUE.includes(token) ? (
                          <li>{t('tokens.pending')}</li>
                        ) : null}
                        {SITE_ONLY_TOKENS.includes(token) ? (
                          <li>{t('tokens.decorationNote')}</li>
                        ) : null}
                      </ul>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-bold">{t('tokens.contrast')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid={`contrast-${tree}`}>
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4">{t('tokens.pair')}</th>
                <th className="py-2 pr-4">{t('tokens.ratio')}</th>
                <th className="py-2 pr-4">{t('tokens.limit')}</th>
                <th className="py-2">{t('tokens.mark')}</th>
              </tr>
            </thead>
            <tbody>
              {CONTRAST_PAIRS[tree].map((pair) => {
                const foreground = colours?.get(pair.foreground);
                const background = colours?.get(pair.background);
                const ratio =
                  foreground === undefined || background === undefined
                    ? null
                    : contrastRatio(foreground, background);
                const mark = ratio === null ? null : markOf(pair, ratio);
                return (
                  <tr
                    key={`${pair.foreground}-${pair.via ?? ''}-${pair.background}`}
                    data-testid="contrast-row"
                    data-ratio={ratio ?? undefined}
                    data-mark={mark ?? undefined}
                    className="border-b border-border"
                  >
                    <td className="py-2 pr-4">
                      {t('tokens.on', { foreground: subject(pair), background: pair.background })}
                    </td>
                    <td className="py-2 pr-4 font-numeric">
                      {ratio === null
                        ? t('tokens.measuring')
                        : t('tokens.ratioValue', { ratio: ratio.toFixed(2) })}
                    </td>
                    <td className="py-2 pr-4 font-numeric">
                      {t('tokens.ratioValue', { ratio: String(pair.limit) })}
                    </td>
                    <td className="py-2">{mark === null ? null : t(MARK_KEY[mark])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
