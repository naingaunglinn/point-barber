// Data values use the digits 0–9 in both languages; Myanmar digits typed into a field (U+1040–U+1049,
// ၀–၉) are read as 0–9 (D-PLT-05 · AD-FMT-10).
const MYANMAR_ZERO = 0x1040;

/** `၀၉ ၇၇၁၂` → `09 7712`. Every other character is kept. */
export function normalizeDigits(text: string): string {
  return text.replace(/[\u1040-\u1049]/g, (digit) =>
    String.fromCharCode(48 + (digit.charCodeAt(0) - MYANMAR_ZERO)),
  );
}
