import { ErrorCode } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { zawgyiFields } from './branches.js';

// add-branch-management task 3.4 — the second stage after the schema (API-SHAPE-05 · design D4): every
// branch member typed in Zawgyi is one errors[] item with the code zawgyi_text. The address of the spec
// scenario "An address typed in Zawgyi" — "No. 3, Example Road" — in Zawgyi and in Unicode.
const ZAWGYI_ADDRESS =
  '\u1021\u1019\u103d\u1010\u1039 \u1043\u104a \u1005\u1019\u1039\u1038\u101e\u1015\u1039\u101c\u1019\u1039\u1038';
const UNICODE_ADDRESS = 'အမှတ် ၃၊ စမ်းသပ်လမ်း';
const zawgyi = (field: string) => ({ field, code: ErrorCode.ZAWGYI_TEXT });

describe('zawgyiFields (task 3.4)', () => {
  it('names, addresses and other-link labels typed in Zawgyi are listed, in member order', () => {
    expect(
      zawgyiFields({
        name_mm: ZAWGYI_ADDRESS,
        name_en: ZAWGYI_ADDRESS,
        address_mm: ZAWGYI_ADDRESS,
        address_en: ZAWGYI_ADDRESS,
        social_links: {
          other: [
            { label: 'Shop', url: 'https://point.example' },
            { label: ZAWGYI_ADDRESS, url: 'https://point.example' },
          ],
        },
      }),
    ).toStrictEqual([
      zawgyi('name_mm'),
      zawgyi('name_en'),
      zawgyi('address_mm'),
      zawgyi('address_en'),
      zawgyi('social_links.other[1].label'),
    ]);
  });

  it('Unicode Myanmar, Latin text and members that are not text pass', () => {
    expect(
      zawgyiFields({
        name_mm: 'ပွိုင့် ၄.၀',
        name_en: 'Point 4.0',
        address_mm: UNICODE_ADDRESS,
        address_en: null,
        phone: ZAWGYI_ADDRESS,
      }),
    ).toStrictEqual([]);
  });
});
