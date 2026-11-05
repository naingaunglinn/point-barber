'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import type { CompanyDto } from '@point/shared';
import { DataText, ReadOnlyFields, type ReadOnlyField } from '@point/ui';

import { LINK_MEMBERS } from './company-values';

// Settings › Company for a holder of a `company.*` code without company-scope `company.update`
// (organization spec "A viewer sees text only" · AD-PERM-02 "hide" · AD-DET-03 · add-company-profile
// design D8): the same sections as the form, the stored values as text — no input and no Save. An
// empty value reads "—".

const EMPTY = '—';
const text = (value: string | null | undefined): string =>
  value === null || value === undefined || value === '' ? EMPTY : value;

export function CompanyReadOnly({ company }: { readonly company: CompanyDto }) {
  const t = useTranslations('settings.company');
  const tBilingual = useTranslations('common.bilingual');
  const links = company.social_links;
  const other = links.other ?? [];
  const sections: readonly { key: string; title: string; fields: readonly ReadOnlyField[] }[] = [
    {
      key: 'name',
      title: t('section.name'),
      fields: [
        { label: tBilingual('mm'), value: company.name_mm },
        { label: tBilingual('en'), value: text(company.name_en) },
      ],
    },
    {
      key: 'contact',
      title: t('section.contact'),
      fields: [
        { label: t('phone'), value: text(company.phone) },
        { label: t('email'), value: text(company.email) },
      ],
    },
    {
      key: 'address',
      title: t('section.address'),
      fields: [
        { label: tBilingual('mm'), value: text(company.address_mm) },
        { label: tBilingual('en'), value: text(company.address_en) },
      ],
    },
    {
      key: 'links',
      title: t('section.links'),
      fields: [
        { label: t('website'), value: text(company.website_url) },
        ...LINK_MEMBERS.map((member) => ({
          label: t(`link.${member}`),
          value: text(links[member]),
        })),
        {
          label: t('other.title'),
          value:
            other.length === 0 ? (
              EMPTY
            ) : (
              <ul className="grid gap-1">
                {other.map((link, index) => (
                  <li key={index}>
                    <DataText>{`${link.label} · ${link.url}`}</DataText>
                  </li>
                ))}
              </ul>
            ),
        },
      ],
    },
  ];
  return (
    <div className="grid w-full max-w-180 gap-6" data-testid="company-read-only">
      {sections.map((section) => (
        <ReadOnlySection key={section.key} title={section.title} fields={section.fields} />
      ))}
    </div>
  );
}

function ReadOnlySection({
  title,
  fields,
}: {
  readonly title: string;
  readonly fields: readonly ReadOnlyField[];
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>
      <ReadOnlyFields fields={fields} />
    </section>
  );
}
