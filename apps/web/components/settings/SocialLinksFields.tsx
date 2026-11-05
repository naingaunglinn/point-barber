'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { CompanyTextField, type CompanyForm } from './CompanyTextField';
import { LINK_MEMBERS } from './company-values';
import { OtherLinksList } from './OtherLinksList';

// The section "Website and social links" of the company form (D-WEB-03 · CP1 · CP2 · add-company-profile
// design D8): the website, Facebook, TikTok, Viber, Instagram and YouTube — every one but Viber an
// `http(s)` address, Viber a `viber://` link or a phone — and the other links. Each address field says
// "Starts with https://" under it.

export function SocialLinksFields({
  form,
  headingClassName,
}: {
  readonly form: CompanyForm;
  readonly headingClassName: string;
}) {
  const t = useTranslations('settings.company');
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid gap-4">
      <h2 id={headingId} className={headingClassName}>
        {t('section.links')}
      </h2>
      <CompanyTextField
        form={form}
        name="website_url"
        label={t('website')}
        helper={t('link.help')}
        testId="company-website"
      />
      {LINK_MEMBERS.map((member) => (
        <CompanyTextField
          key={member}
          form={form}
          name={`social_links.${member}`}
          label={t(`link.${member}`)}
          helper={member === 'viber' ? t('viber.help') : t('link.help')}
          testId={`company-link-${member}`}
        />
      ))}
      <OtherLinksList form={form} />
    </section>
  );
}
