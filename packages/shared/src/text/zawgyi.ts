import { ZawgyiConverter } from './myanmar-tools/zawgyi-converter.js';
import { ZawgyiDetector } from './myanmar-tools/zawgyi-detector.js';

// Zawgyi typed into a shared text input is converted to Unicode before it is saved, and the screen
// shows the converted text for confirmation (AD-FORM-13 · AD-L10N-07 · design D11). Detector and
// converter: Google's myanmar-tools 1.2.0, vendored in ./myanmar-tools (see its header).

/** Convert only when the detector is at least this sure (design D11). */
const THRESHOLD = 0.95;

/**
 * Sequences Unicode never stores (UTN #11 order) that Zawgyi typing produces. The detector alone scores
 * short Unicode text at 0.95 or more — မိုးရွာ, ဘာသာစကား — and the converter would rewrite it (ရွာ → ရှာ),
 * so text with none of these is Unicode, whatever the detector says (lead, 18/Nov/2026).
 */
const ZAWGYI_ONLY_SEQUENCES: readonly RegExp[] = [
  /(?:^|[^\u1000-\u102a\u103b-\u103f\u104e])\u1031/u, // ေ typed before its consonant
  /\u1039(?![\u1000-\u1021])/u, // U+1039 as the visible asat, not stacking a consonant
  /\u103a[\u102b-\u102e\u1031\u1032\u103b-\u103e]/u, // U+103A as the medial ya, before a vowel sign
  /(?:^|[^\u1000-\u1021\u103b-\u103e])[\u103b-\u103e]/u, // a medial typed before its consonant
  /[\u1033\u1034\u1060-\u1097]/u, // Zawgyi glyph code points (Mon, Shan and Karen letters in Unicode)
  /\u1036[\u102f\u1030]/u, // ံ typed before ု / ူ
];

function hasZawgyiOnlySequence(text: string): boolean {
  return ZAWGYI_ONLY_SEQUENCES.some((sequence) => sequence.test(text));
}

let detector: ZawgyiDetector | undefined;
let converter: ZawgyiConverter | undefined;

function zawgyiProbability(text: string): number {
  detector ??= new ZawgyiDetector();
  return detector.getZawgyiProbability(text);
}

/** The detector's estimate that `text` is Zawgyi; tests pass their own (design D11). */
export interface ZawgyiOptions {
  readonly probability?: (text: string) => number;
}

/**
 * True when `text` holds a sequence Unicode never stores and the detector is at least 0.95 sure it is
 * Zawgyi — the server's refusal `zawgyi_text` (API-SHAPE-05 · add-company-profile design D10) uses the
 * same rule as the input's conversion, so text a shared input accepted is accepted.
 */
export function isZawgyi(
  text: string,
  { probability = zawgyiProbability }: ZawgyiOptions = {},
): boolean {
  return hasZawgyiOnlySequence(text) && probability(text) >= THRESHOLD;
}

export interface NormalizedText {
  readonly text: string;
  /** True when the text was Zawgyi and has been converted — the input shows a notice. */
  readonly converted: boolean;
}

/** `ျမန္မာ` (Zawgyi) → `{ text: 'မြန်မာ', converted: true }`; Unicode text is returned untouched. */
export function normalizeMyanmarText(text: string, options: ZawgyiOptions = {}): NormalizedText {
  if (!isZawgyi(text, options)) return { text, converted: false };
  converter ??= new ZawgyiConverter();
  return { text: converter.zawgyiToUnicode(text), converted: true };
}
