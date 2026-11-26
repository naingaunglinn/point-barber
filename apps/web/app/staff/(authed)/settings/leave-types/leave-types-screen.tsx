'use client';

import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import type { Locale } from '@point/i18n';
import { type LeaveType, LeaveTypeStatus, localized } from '@point/shared';
import {
  Button,
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

import { LeaveTypeDialog } from '../../../../../components/leave-types/LeaveTypeDialog';
import { useLeaveTypeAccess } from '../../../../../lib/leave-types/access';
import { useLeaveTypes } from '../../../../../lib/leave-types/queries';
import { screenProblem } from '../../../../../lib/pos/problem';
import { MainQueryState, RefusedPage } from '../../../../../lib/session/main-query-state';
import { useMe } from '../../../../../lib/session/use-me';

// /settings/leave-types — Settings › Leave types (add-leave-types spec "The leave-type list shows every
// type in its order with its paid flag and status" · AD-SET-04 · AD-LIST-02 / 06 · AD-STATE-01 … 04 ·
// design D9): the types in the API's order (P2.LVT.01 — sort_order, Myanmar name, id); from 768 px a
// table — Name · Paid · Status — below it one card per type. Chips: Active and Inactive (the status, in
// the address; none = both) and Archived (adds the archived types — include_archived). New leave type
// with company-scope leave_type.create; a row opens the dialog. Without a leave-type code the forbidden
// page. The reorder controls (task 3.3) wait for their texts.

const STATUS_CODES = [LeaveTypeStatus.ACTIVE, LeaveTypeStatus.INACTIVE];

/** The name in the UI language (AD-L10N-03 fallback), carrying the row's test id. */
function NameCell({ id, name }: Readonly<{ id: string; name: string }>) {
  return (
    <span className="font-semibold" data-testid={`leave-type-row-${id}`}>
      <DataText>{name}</DataText>
    </span>
  );
}

export function LeaveTypesScreen() {
  const t = useTranslations('leaveType');
  const locale = useLocale() as Locale;
  const search = useSearchParams();
  const access = useLeaveTypeAccess();
  const me = useMe().data;
  const [filter, setFilter] = useState<FilterValue>(() => {
    const { status } = filterFromSearch(new URLSearchParams(search.toString()));
    return { status: status ?? [LeaveTypeStatus.ACTIVE] };
  });
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState<{ readonly leaveType?: LeaveType } | null>(null);
  const types = useLeaveTypes(archived, access.any);

  if (!access.any) return <RefusedPage code="forbidden" />;

  const statuses = filter.status ?? [];
  const rows = (types.data ?? []).filter((type) =>
    type.archived_at === null ? statuses.length === 0 || statuses.includes(type.status) : archived,
  );
  const name = (type: LeaveType) => localized(type, 'name', locale);
  const paid = (type: LeaveType) => (type.is_paid ? t('list.paid') : t('list.unpaid'));
  // AD-CMP-05 master data: an ACTIVE type has no badge; INACTIVE the muted one; archived its word.
  const badge = (type: LeaveType) =>
    type.archived_at !== null ? (
      <span className="text-sm text-muted-foreground">{t('list.archived')}</span>
    ) : type.status === LeaveTypeStatus.INACTIVE ? (
      <StatusBadge table="leave_types" code={type.status} />
    ) : null;

  const columns: readonly DataTableColumn<LeaveType>[] = [
    {
      key: 'name',
      header: t('list.column.name'),
      kind: 'custom',
      render: (type) => <NameCell id={type.id} name={name(type)} />,
    },
    { key: 'paid', header: t('list.column.paid'), kind: 'text', value: paid },
    { key: 'status', header: t('list.column.status'), kind: 'custom', render: badge },
  ];

  let content;
  if (types.data === undefined && types.isError) {
    const { code, request_id } = screenProblem(types.error);
    content = (
      <MainQueryState error={types.error}>
        <ErrorState
          problem={{ code, ...(request_id === '' ? {} : { request_id }) }}
          onRetry={() => types.refetch()}
        />
      </MainQueryState>
    );
  } else if (types.data !== undefined && rows.length === 0) {
    content = <EmptyState title={t('list.emptyFiltered')} />;
  } else {
    content = (
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(type) => type.id}
        card={(type) => {
          const status = badge(type);
          return {
            fields:
              status === null
                ? [
                    <NameCell key="name" id={type.id} name={name(type)} />,
                    <DataText key="paid">{paid(type)}</DataText>,
                  ]
                : [
                    <NameCell key="name" id={type.id} name={name(type)} />,
                    <DataText key="paid">{paid(type)}</DataText>,
                    <span key="status">{status}</span>,
                  ],
          };
        }}
        userId={me?.user.id ?? ''}
        storageKey="settings-leave-types"
        loading={types.isPending}
        onRowPress={(type) => setOpen({ leaveType: type })}
      />
    );
  }

  return (
    <div className="grid w-full gap-6" data-testid="leave-types-list">
      <title>{t('list.title')}</title>
      <PageHeader
        title={t('list.title')}
        primary={{
          label: t('list.new'),
          allowed: access.create,
          onPress: () => setOpen({}),
          testId: 'leave-type-new',
        }}
        filterBar={
          <div className="flex flex-wrap items-start gap-2">
            <FilterBar
              value={filter}
              onChange={setFilter}
              presets={[]}
              statuses={{ table: 'leave_types', codes: STATUS_CODES }}
            />
            <Button
              aria-pressed={archived}
              onClick={() => setArchived(!archived)}
              data-testid="leave-types-archived"
            >
              {t('list.archived')}
            </Button>
          </div>
        }
      />
      {content}
      {open === null ? null : (
        <LeaveTypeDialog
          {...(open.leaveType === undefined ? {} : { leaveType: open.leaveType })}
          canUpdate={access.update}
          canArchive={access.archive}
          onClose={() => setOpen(null)}
          onReload={async () => {
            const fresh = (await types.refetch({ throwOnError: true })).data ?? [];
            const stored = fresh.find((type) => type.id === open.leaveType?.id);
            // Gone from the list meanwhile (archived): nothing is left to edit.
            if (stored === undefined) setOpen(null);
            return stored;
          }}
        />
      )}
    </div>
  );
}
