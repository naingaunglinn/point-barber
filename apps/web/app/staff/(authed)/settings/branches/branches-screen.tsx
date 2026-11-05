'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import type { Locale } from '@point/i18n';
import { type BranchSummary, BranchStatus, localized } from '@point/shared';
import {
  DataTable,
  type DataTableColumn,
  DataText,
  EmptyState,
  ErrorState,
  FilterBar,
  type FilterValue,
  PageHeader,
  StatusBadge,
  filterFromSearch,
} from '@point/ui';

import { useBranchAccess } from '../../../../../lib/branches/access';
import { useBranches } from '../../../../../lib/branches/queries';
import { screenProblem } from '../../../../../lib/pos/problem';
import { MainQueryState, RefusedPage } from '../../../../../lib/session/main-query-state';
import { useMe } from '../../../../../lib/session/use-me';

// /settings/branches — Settings › Branches (add-branch-management spec "The branch list shows the
// branches the user's branch grants cover" · AD-LIST-01 / 02 / 06 · AD-STATE-01 … 04 · API-PERM-07 ·
// design D9 · task 4.3): P1.BR.01 filtered to the branches the user's branch.* grants cover (every
// branch at company scope), ordered by code; from 768 px a table — Code · Name · Phone · Website ·
// Status — below it one card per branch; the status chips Active / Inactive (none = every status, kept
// in the address); New branch only with company-scope branch.create. Without a branch code the
// forbidden page. The page title is the screen's name (WCAG 2.4.2).

const STATUS_CODES = [BranchStatus.ACTIVE, BranchStatus.INACTIVE];

function CodeCell({ code }: Readonly<{ code: string }>) {
  return (
    <span className="font-semibold" data-testid={`branch-row-${code}`}>
      <DataText>{code}</DataText>
    </span>
  );
}

export function BranchesScreen() {
  const t = useTranslations('branch.list');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const search = useSearchParams();
  const access = useBranchAccess();
  const me = useMe().data;
  const branches = useBranches();
  const [filter, setFilter] = useState<FilterValue>(() => {
    const { status } = filterFromSearch(new URLSearchParams(search.toString()));
    return status === undefined ? {} : { status };
  });

  if (!access.any) return <RefusedPage code="forbidden" />;

  const statuses = filter.status ?? [];
  const rows = (branches.data ?? [])
    .filter((branch) => access.covers(branch.id))
    .filter((branch) => statuses.length === 0 || statuses.includes(branch.status))
    // Codes are capital letters and digits (P1.BR.02), so the plain order is the code order.
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  const open = (branch: BranchSummary) => router.push(`/settings/branches/${branch.id}`);
  const shown = (branch: BranchSummary) => (branch.is_public ? t('shown') : t('hidden'));

  const columns: readonly DataTableColumn<BranchSummary>[] = [
    {
      key: 'code',
      header: t('column.code'),
      kind: 'custom',
      render: (branch) => <CodeCell code={branch.code} />,
    },
    {
      key: 'name',
      header: t('column.name'),
      kind: 'text',
      value: (branch) => localized(branch, 'name', locale),
    },
    {
      key: 'phone',
      header: t('column.phone'),
      kind: 'text',
      value: (branch) => branch.phone ?? '',
    },
    { key: 'website', header: t('column.website'), kind: 'text', value: shown },
    {
      key: 'status',
      header: t('column.status'),
      kind: 'status',
      value: (branch) => ({ table: 'branches', code: branch.status }),
    },
  ];

  let content;
  if (branches.isError) {
    const { code, request_id } = screenProblem(branches.error);
    content = (
      <MainQueryState error={branches.error}>
        <ErrorState
          problem={{ code, ...(request_id === '' ? {} : { request_id }) }}
          onRetry={() => branches.refetch()}
        />
      </MainQueryState>
    );
  } else if (branches.data !== undefined && rows.length === 0) {
    content = <EmptyState title={t('emptyFiltered')} />;
  } else {
    content = (
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(branch) => branch.id}
        card={(branch) => ({
          fields:
            branch.phone === null
              ? [
                  <CodeCell key="code" code={branch.code} />,
                  <DataText key="name">{localized(branch, 'name', locale)}</DataText>,
                  <StatusBadge key="status" table="branches" code={branch.status} />,
                ]
              : [
                  <CodeCell key="code" code={branch.code} />,
                  <DataText key="name">{localized(branch, 'name', locale)}</DataText>,
                  <StatusBadge key="status" table="branches" code={branch.status} />,
                  <DataText key="phone">{branch.phone}</DataText>,
                ],
        })}
        userId={me?.user.id ?? ''}
        storageKey="settings-branches"
        loading={branches.isPending}
        onRowPress={open}
      />
    );
  }

  return (
    <div className="grid w-full gap-6" data-testid="branches-list">
      <title>{t('title')}</title>
      <PageHeader
        title={t('title')}
        primary={{
          label: t('new'),
          allowed: access.create,
          onPress: () => router.push('/settings/branches/new'),
          testId: 'branch-new',
        }}
        filterBar={
          <FilterBar
            value={filter}
            onChange={setFilter}
            presets={[]}
            statuses={{ table: 'branches', codes: STATUS_CODES }}
          />
        }
      />
      {content}
    </div>
  );
}
