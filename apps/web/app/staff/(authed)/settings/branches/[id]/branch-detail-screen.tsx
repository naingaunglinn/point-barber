'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import type { Locale } from '@point/i18n';
import { type Branch, localized } from '@point/shared';
import { DataText, ErrorState, PageHeader, Skeleton, StatusBadge } from '@point/ui';

import { BranchForm } from '../../../../../../components/branches/BranchForm';
import { useBranchStatusAction } from '../../../../../../components/branches/BranchStatusAction';
import { BranchValues } from '../../../../../../components/branches/BranchValues';
import { useBranchAccess } from '../../../../../../lib/branches/access';
import { branchValues, updateFormSchema } from '../../../../../../lib/branches/form-values';
import { useBranch, useUpdateBranch } from '../../../../../../lib/branches/queries';
import { screenProblem } from '../../../../../../lib/pos/problem';
import { MainQueryState, RefusedPage } from '../../../../../../lib/session/main-query-state';

// /settings/branches/[id] — a branch (add-branch-management spec "The branch form creates and edits a
// branch with messages at the fields" · "The detail page deactivates and re-activates a branch…" ·
// AD-DET-01 · AD-FORM-08 · AD-RT-02 · AD-PERM-02 · AD-STATE-01 … 04 · design D9 · tasks 4.5 / 4.7): the
// header shows the name, the code, the status badge and the staff assigned today, and the status action
// for company-scope branch.delete. With branch.update for the branch the form edits it — Save sends only
// the changed members and the `updated_at` it loaded (API-IDEM-04); otherwise every value is text.
// Without a branch code the forbidden page; a branch outside the read scope is the API's 404.

/**
 * The form of a branch the user may change. It edits the branch as it was opened — the header follows
 * the live branch, the form keeps the user's input and sends the `updated_at` it loaded, so an edit made
 * meanwhile by someone else answers 409 `conflict` (AD-RT-02). A save or Reload starts it again from the
 * branch the API answered; so does a newer branch (a status change) while the form holds no edit.
 */
function Editor({ branch, reload }: Readonly<{ branch: Branch; reload: Reload }>) {
  const router = useRouter();
  const update = useUpdateBranch(branch.id);
  const [base, setBase] = useState(branch);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const stored = useMemo(() => branchValues(base), [base]);
  const schema = useMemo(
    () => updateFormSchema(stored, base.updated_at),
    [stored, base.updated_at],
  );
  const restart = (next: Branch) => {
    setBase(next);
    setVersion((value) => value + 1);
    setDirty(false);
  };
  useEffect(() => {
    if (!dirty && branch.updated_at !== base.updated_at) restart(branch);
  });
  return (
    <BranchForm
      key={version}
      branch={base}
      defaultValues={stored}
      schema={schema}
      save={(body) => update.mutateAsync(body)}
      onSaved={restart}
      onCancel={() => router.push('/settings/branches')}
      onDirtyChange={setDirty}
      onReload={async () => {
        const fresh = await reload();
        if (fresh !== undefined) restart(fresh);
      }}
    />
  );
}

/** Loads the branch again; the fresh branch, or undefined when the load failed. */
type Reload = () => Promise<Branch | undefined>;

function Detail({ branch, reload }: Readonly<{ branch: Branch; reload: Reload }>) {
  const t = useTranslations('branch');
  const locale = useLocale() as Locale;
  const access = useBranchAccess();
  const status = useBranchStatusAction(branch);
  const name = localized(branch, 'name', locale);
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6" data-testid="branch-detail">
      <title>{name}</title>
      <PageHeader
        title={name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <DataText>{branch.code}</DataText>
            <span data-testid="branch-status-badge">
              <StatusBadge table="branches" code={branch.status} />
            </span>
            <span>{t('detail.activeEmployees', { count: branch.active_employees })}</span>
          </span>
        }
        secondary={status.action === null ? [] : [status.action]}
      />
      {status.alert}
      {access.update(branch.id) ? (
        <Editor branch={branch} reload={reload} />
      ) : (
        <BranchValues branch={branch} />
      )}
      {status.dialog}
    </div>
  );
}

export function BranchDetailScreen({ id }: { readonly id: string }) {
  const access = useBranchAccess();
  const branch = useBranch(id);
  if (!access.any) return <RefusedPage code="forbidden" />;
  if (branch.isError) {
    const { code, request_id } = screenProblem(branch.error);
    return (
      <MainQueryState error={branch.error}>
        <ErrorState
          problem={{ code, ...(request_id === '' ? {} : { request_id }) }}
          onRetry={() => branch.refetch()}
        />
      </MainQueryState>
    );
  }
  if (branch.data === undefined) {
    return (
      <div aria-busy="true" data-testid="branch-loading">
        <Skeleton shape="row" count={6} />
      </div>
    );
  }
  return <Detail branch={branch.data} reload={async () => (await branch.refetch()).data} />;
}
