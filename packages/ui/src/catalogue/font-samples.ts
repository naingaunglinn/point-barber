// Test strings of the Fonts section (AD-VIS-05 · FE-VIS-02 · design D3). Sample data, not UI copy.

/** The Myanmar strings AD-VIS-05 names for checking vowel, medial and asat stacking. */
export const MYANMAR_TEST_STRINGS = [
  'ကြိုတင်ချိန်းဆိုမှု',
  'နေ့စဉ်စာရင်းပိတ်',
  'ငွေပေးချေမှု',
  'ဝန်ဆောင်မှုပေးခြင်း',
] as const;

/** The Myanmar digits U+1040–U+1049, kept in the Pyidaungsu subset (AD-FMT-10). */
export const MYANMAR_DIGITS = '၀၁၂၃၄၅၆၇၈၉';

/** A money column (AD-VIS-05: tabular figures) and the two strings that measure the same width. */
export const TABULAR_AMOUNTS = [1_250_000, 7_000, 999] as const;
export const TABULAR_WIDTH_PAIR = ['0000000', '1111111'] as const;
