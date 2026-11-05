'use client';

import { useTranslations } from 'next-intl';

import { COMPANY_LIMITS } from '@point/shared';
import { Button, useFieldArray } from '@point/ui';

import { SOCIAL_LINKS, type SocialLinkKey } from '../../lib/branches/form-values';
import { type BranchBody, type BranchForm, BranchTextField } from './BranchFields';

// The social links of a branch (add-branch-management task 4.6 · spec "Branch members are checked against
// their limits" · P1.BR.02 · design D4 · D9): Facebook, TikTok, Instagram and YouTube as web addresses
// (`http(s)` only — a `javascript:` link is refused under its field), Viber as text (a `viber://` link or
// a phone), and up to 10 *Other* rows of a label and a link, added and removed here. The object replaces
// the stored one whole; blank links are left out (design D4). Each web address opens the phone's url
// keyboard without a capital letter; Viber keeps the text keyboard.

/** The members that are `http(s)` addresses — every one but Viber. */
const LINK: Readonly<Record<SocialLinkKey, boolean>> = {
  facebook: true,
  tiktok: true,
  instagram: true,
  youtube: true,
  viber: false,
};

export function SocialLinksEditor<B extends BranchBody>({
  form,
}: Readonly<{ form: BranchForm<B> }>) {
  const t = useTranslations('branch.field.social');
  const other = useFieldArray({ control: form.control, name: 'social_links.other' });
  return (
    <div className="grid gap-4" data-testid="branch-social-links">
      {SOCIAL_LINKS.map((key) => (
        <BranchTextField
          key={key}
          form={form}
          name={`social_links.${key}`}
          label={t(key)}
          link={LINK[key]}
          maxLength={COMPANY_LIMITS.LINK}
        />
      ))}
      <fieldset className="grid gap-3" data-testid="branch-social-other">
        <legend className="text-sm font-semibold">{t('other')}</legend>
        {other.fields.map((row, index) => (
          <div
            key={row.id}
            className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1fr_2fr_auto] md:items-end"
            data-testid={`branch-social-other-${index}`}
          >
            <BranchTextField
              form={form}
              name={`social_links.other.${index}.label`}
              label={t('label')}
              required
              maxLength={COMPANY_LIMITS.OTHER_LABEL}
            />
            <BranchTextField
              form={form}
              name={`social_links.other.${index}.url`}
              label={t('url')}
              required
              link
              maxLength={COMPANY_LIMITS.LINK}
            />
            <Button
              variant="ghost"
              onClick={() => other.remove(index)}
              data-testid={`branch-social-remove-${index}`}
            >
              {t('remove')}
            </Button>
          </div>
        ))}
        {other.fields.length < COMPANY_LIMITS.OTHER_LINKS ? (
          <div>
            <Button
              onClick={() => other.append({ label: '', url: '' })}
              data-testid="branch-social-add"
            >
              {t('add')}
            </Button>
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}
