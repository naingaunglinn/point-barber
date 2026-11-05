'use client';

import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { COMPANY_LIMITS } from '@point/shared';
import { Button, useFieldArray } from '@point/ui';

import { CompanyTextField, type CompanyForm } from './CompanyTextField';

// The other links of the company (`social_links.other` — CP1 · CP2): each a label (1 – 50 characters) and
// an `http(s)` address; added and removed here, at most 10 — the Add button is not offered once there
// are 10.

export function OtherLinksList({ form }: { readonly form: CompanyForm }) {
  const t = useTranslations('settings.company.other');
  const tAction = useTranslations('common.action');
  const headingId = useId();
  const links = useFieldArray({ control: form.control, name: 'social_links.other' });
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="grid gap-3"
      data-testid="company-other"
    >
      <h3 id={headingId} className="font-semibold">
        {t('title')}
      </h3>
      {links.fields.map((link, index) => (
        <div
          key={link.id}
          className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1fr_2fr_auto] md:items-start"
          data-testid={`company-other-${index}`}
        >
          <CompanyTextField
            form={form}
            name={`social_links.other.${index}.label`}
            label={t('label')}
            testId={`company-other-${index}-label`}
            required
          />
          <CompanyTextField
            form={form}
            name={`social_links.other.${index}.url`}
            label={t('url')}
            testId={`company-other-${index}-url`}
            required
          />
          <Button
            variant="ghost"
            iconOnly
            icon={<X />}
            aria-label={tAction('delete')}
            className="justify-self-end md:mt-7"
            data-testid={`company-other-${index}-remove`}
            onClick={() => links.remove(index)}
          />
        </div>
      ))}
      {links.fields.length < COMPANY_LIMITS.OTHER_LINKS ? (
        <div>
          <Button
            icon={<Plus />}
            data-testid="company-other-add"
            onClick={() => links.append({ label: '', url: '' })}
          >
            {t('add')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
