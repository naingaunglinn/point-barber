'use client';

import { useTranslations } from 'next-intl';

import type { Branch } from '@point/shared';
import { DataText, ReadOnlyFields, type ReadOnlyField } from '@point/ui';

import { SOCIAL_LINKS, branchValues } from '../../lib/branches/form-values';
import { BranchSection } from './BranchFields';

// A branch the user may read but not change (AD-PERM-02 · AD-DET-03 · add-branch-management spec "The
// branch form creates and edits a branch with messages at the fields" — Ma Hnin, the seed Manager): the
// three sections of the form with every value as text, no input and no Save.

/** A Myanmar / English pair as two lines of text; the English line only when there is one. */
function Pair({ mm, en }: Readonly<{ mm: string; en: string }>) {
  return (
    <span className="flex flex-col">
      <DataText>{mm}</DataText>
      {en === '' ? null : <DataText>{en}</DataText>}
    </span>
  );
}

export function BranchValues({ branch }: Readonly<{ branch: Branch }>) {
  const t = useTranslations('branch');
  const values = branchValues(branch);
  const links = values.social_links;
  const website: ReadOnlyField[] = [
    { label: t('field.isPublic'), value: branch.is_public ? t('list.shown') : t('list.hidden') },
    { label: t('field.websiteUrl'), value: values.website_url },
    ...SOCIAL_LINKS.map((key) => ({ label: t(`field.social.${key}`), value: links[key] })),
    ...links.other.map((link) => ({
      label: link.label,
      value: link.url,
    })),
  ];
  return (
    <div className="grid gap-8" data-testid="branch-form">
      <BranchSection title={t('form.section.branch')}>
        <ReadOnlyFields
          fields={[
            { label: t('field.code'), value: branch.code },
            { label: t('field.name'), value: <Pair mm={values.name_mm} en={values.name_en} /> },
            { label: t('field.phone'), value: values.phone },
            { label: t('field.email'), value: values.email },
          ]}
        />
      </BranchSection>
      <BranchSection title={t('form.section.location')}>
        <ReadOnlyFields
          fields={[
            {
              label: t('field.address'),
              value: <Pair mm={values.address_mm} en={values.address_en} />,
            },
            { label: t('field.latitude'), value: values.latitude },
            { label: t('field.longitude'), value: values.longitude },
            { label: t('field.radius'), value: values.location_radius_meters },
            { label: t('field.mapUrl'), value: values.map_url },
          ]}
        />
      </BranchSection>
      <BranchSection title={t('form.section.website')}>
        <ReadOnlyFields fields={website} />
      </BranchSection>
    </div>
  );
}
