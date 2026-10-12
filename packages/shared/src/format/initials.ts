import { hasMyanmarScript } from '../text/localized.js';

// The initials of an employee chip without a photo (AD-CMP-09 · AD-VIS-12 · design D8): a Latin name
// gives the first letter of its first two words, upper-cased (`Ko Aung` → `KA`); a Myanmar-script name
// gives the first grapheme cluster of its first word (`ကိုအောင်` → `ကို`), so a consonant keeps its vowel
// and medial signs.
const segmenter = new Intl.Segmenter('my', { granularity: 'grapheme' });

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) return '';
  if (hasMyanmarScript(first))
    return segmenter.segment(first)[Symbol.iterator]().next().value?.segment ?? '';
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}
