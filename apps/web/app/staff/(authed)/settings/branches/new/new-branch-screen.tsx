'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@point/ui';

import { BranchForm } from '../../../../../../components/branches/BranchForm';
import { useBranchAccess } from '../../../../../../lib/branches/access';
import { createFormSchema, emptyBranchValues } from '../../../../../../lib/branches/form-values';
import { useCreateBranch } from '../../../../../../lib/branches/queries';
import { RefusedPage } from '../../../../../../lib/session/main-query-state';

// /settings/branches/new — New branch (add-branch-management spec "The branch form creates and edits a
// branch with messages at the fields" · "A branch is created only with branch.create held at company
// scope" · AD-PERM-02 · design D9 · task 4.4): only with company-scope branch.create, else the forbidden
// page. Save → P1.BR.02 → the toast "Branch saved" and the new branch's detail page. An empty attendance
// radius is not sent, so the API gives the company setting (design D5). Cancel goes back to the list.
export function NewBranchScreen() {
  const t = useTranslations('branch.list');
  const router = useRouter();
  const access = useBranchAccess();
  const create = useCreateBranch();
  if (!access.create) return <RefusedPage code="forbidden" />;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6" data-testid="branch-new-screen">
      <title>{t('new')}</title>
      <PageHeader title={t('new')} />
      <BranchForm
        defaultValues={emptyBranchValues()}
        schema={createFormSchema}
        save={(body) => create.mutateAsync(body)}
        onSaved={(branch) => router.push(`/settings/branches/${branch.id}`)}
        onCancel={() => router.push('/settings/branches')}
      />
    </div>
  );
}
