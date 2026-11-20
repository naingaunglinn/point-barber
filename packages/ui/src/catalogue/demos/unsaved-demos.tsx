'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { TextInput } from '../../components/TextInput/TextInput';
import { UnsavedChangesProvider, useUnsavedChanges } from '../../navigation/unsaved-changes';
import { useDemoTitleId } from '../demo-title';

// The unsaved-changes guard (add-unsaved-changes-guard task 1.9 · AD-FORM-08): a small form that reports
// its dirty state, and a link to another page. While the field holds text the link asks "Discard changes?"
// and so do the browser's Back and a reload; emptying the field makes the page clean again.
const OTHER_PAGE = '/dev/ui/';

function Form() {
  const titleId = useDemoTitleId();
  const t = useTranslations('devui.unsaved');
  const [value, setValue] = useState('');
  useUnsavedChanges(value !== '');
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <TextInput aria-labelledby={titleId} value={value} onChange={setValue} />
      <Link href={OTHER_PAGE} className="text-sm underline">
        {t('leave')}
      </Link>
    </div>
  );
}

export function UnsavedChangesDemo() {
  return (
    <UnsavedChangesProvider>
      <Form />
    </UnsavedChangesProvider>
  );
}
