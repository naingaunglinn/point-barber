import { hasMyanmarScript } from './localized.js';
import { ZawgyiConverter } from './myanmar-tools/zawgyi-converter.js';
import { ZawgyiDetector } from './myanmar-tools/zawgyi-detector.js';

// Zawgyi typed into a shared text input is converted to Unicode before it is saved, and the screen
// shows the converted text for confirmation (AD-FORM-13 · AD-L10N-07 · design D11). Detector and
// converter: Google's myanmar-tools 1.2.0, vendored in ./myanmar-tools (see its header).

/** Convert only when the detector is at least this sure (design D11). */
const THRESHOLD = 0.95;

let detector: ZawgyiDetector | undefined;
let converter: ZawgyiConverter | undefined;

function zawgyiProbability(text: string): number {
  detector ??= new ZawgyiDetector();
  return detector.getZawgyiProbability(text);
}

export interface NormalizedText {
  readonly text: string;
  /** True when the text was Zawgyi and has been converted — the input shows a notice. */
  readonly converted: boolean;
}

/** `ျမန္မာ` (Zawgyi) → `{ text: 'မြန်မာ', converted: true }`; Unicode text is returned untouched. */
export function normalizeMyanmarText(
  text: string,
  { probability = zawgyiProbability }: { readonly probability?: (text: string) => number } = {},
): NormalizedText {
  if (!hasMyanmarScript(text) || probability(text) < THRESHOLD) return { text, converted: false };
  converter ??= new ZawgyiConverter();
  return { text: converter.zawgyiToUnicode(text), converted: true };
}
