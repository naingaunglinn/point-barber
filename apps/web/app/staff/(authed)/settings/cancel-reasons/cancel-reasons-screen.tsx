'use client';

import { Lock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import type { Locale } from '@point/i18n';
import { type CancelReason, CancelReasonStatus, type Problem, localized } from '@point/shared';
import {
  Button,
  ConfirmDialog,
  DataText,
  EmptyState,
  ErrorState,
  FormAlert,
  PageHeader,
  Skeleton,
  StatusBadge,
  Switch,
  toast,
} from '@point/ui';

import { CancelReasonDialog } from '../../../../../components/cancel-reasons/CancelReasonDialog';
import { ReorderList } from '../../../../../components/settings/ReorderList';
import { ApiProblem } from '../../../../../lib/api/client';
import { useCancelReasonAccess } from '../../../../../lib/cancel-reasons/access';
import {
  useArchiveCancelReason,
  useCancelReasons,
  useReorderCancelReasons,
} from '../../../../../lib/cancel-reasons/queries';
import { screenProblem } from '../../../../../lib/pos/problem';
import { MainQueryState, RefusedPage } from '../../../../../lib/session/main-query-state';

// /settings/cancel-reasons — Settings › Cancel reasons (add-booking-cancel-reasons spec "Settings › Cancel
// reasons keeps the master list" · AD-SET-04 · AD-NAV-02 · AD-PERM-02 · AD-L10N-03 · AD-STATE-01 … 04 ·
// design D9): the non-archived reasons in `sort_order` as the shared reorder list — name in the UI language
// (Myanmar when the English one is empty), a "Note required" mark, the Inactive badge, a lock icon on the
// `system_code` row, Edit and Archive (none for the system row to archive) — and one "Save order" that
// sends every non-archived id. "Show archived" adds the archived reasons below, as text. Add, Edit,
// Archive and the order controls only with the code at company scope (AD-PERM-02); without a
// cancel-reason code the forbidden page.

type Refusal = Pick<Problem, 'code' | 'request_id'>;
const NO_ANSWER: Refusal = { code: 'unknown', request_id: '' };
const refusalOf = (error: unknown): Refusal =>
  error instanceof ApiProblem ? error.problem : NO_ANSWER;

export function CancelReasonsScreen() {
  const t = useTranslations('cancelReason');
  const locale = useLocale() as Locale;
  const access = useCancelReasonAccess();
  const switchLabel = useId();
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState<{ readonly reason?: CancelReason } | null>(null);
  const [archiving, setArchiving] = useState<CancelReason | null>(null);
  const [alert, setAlert] = useState<Refusal | null>(null);
  const reasons = useCancelReasons(archived, access.any);
  const reorder = useReorderCancelReasons();
  const archive = useArchiveCancelReason();

  if (!access.any) return <RefusedPage code="forbidden" />;

  const rows = reasons.data ?? [];
  const live = rows.filter((reason) => reason.archived_at === null);
  const gone = rows.filter((reason) => reason.archived_at !== null);
  const name = (reason: CancelReason) => localized(reason, 'name', locale);

  const saveOrder = async (ids: readonly string[]) => {
    setAlert(null);
    try {
      await reorder.mutateAsync(ids);
      toast.success(t('toast.reordered'));
    } catch (error) {
      setAlert(refusalOf(error));
    }
  };

  const confirmArchive = async () => {
    const reason = archiving;
    setArchiving(null);
    if (reason === null) return;
    setAlert(null);
    try {
      await archive.mutateAsync(reason.id);
      toast.success(t('toast.archived'));
    } catch (error) {
      setAlert(refusalOf(error));
    }
  };

  const renderItem = (reason: CancelReason) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold" data-testid={`cancel-reason-row-${reason.id}`}>
        <DataText>{name(reason)}</DataText>
      </span>
      {reason.system_code === null ? null : (
        <Lock
          role="img"
          aria-label={t('system.locked')}
          className="size-4 shrink-0 text-muted-foreground"
          data-testid={`cancel-reason-lock-${reason.id}`}
        />
      )}
      {reason.requires_note ? (
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {t('list.noteRequired')}
        </span>
      ) : null}
      {reason.status === CancelReasonStatus.INACTIVE ? (
        <StatusBadge table="booking_cancel_reasons" code={reason.status} />
      ) : null}
      <span className="ms-auto flex gap-2">
        {access.update ? (
          <Button
            onClick={() => setOpen({ reason })}
            data-testid={`cancel-reason-edit-${reason.id}`}
          >
            {t('list.edit')}
          </Button>
        ) : null}
        {access.archive && reason.system_code === null ? (
          <Button
            onClick={() => setArchiving(reason)}
            data-testid={`cancel-reason-archive-${reason.id}`}
          >
            {t('list.archive')}
          </Button>
        ) : null}
      </span>
    </div>
  );

  let content;
  if (reasons.data === undefined && reasons.isError) {
    const { code, request_id } = screenProblem(reasons.error);
    content = (
      <MainQueryState error={reasons.error}>
        <ErrorState
          problem={{ code, ...(request_id === '' ? {} : { request_id }) }}
          onRetry={() => reasons.refetch()}
        />
      </MainQueryState>
    );
  } else if (reasons.data === undefined) {
    content = <Skeleton shape="row" count={4} />;
  } else if (live.length === 0 && gone.length === 0) {
    content = <EmptyState title={t('list.empty')} />;
  } else {
    content = (
      <>
        <ReorderList
          items={live}
          getId={(reason) => reason.id}
          renderItem={renderItem}
          onSave={saveOrder}
          saving={reorder.isPending}
          readOnly={!access.update}
          label={t('list.label')}
          testId="cancel-reasons-order"
        />
        {gone.length === 0 ? null : (
          <section className="grid gap-2" data-testid="cancel-reasons-archived-list">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {t('list.archivedHeading')}
            </h2>
            <ul className="grid gap-2">
              {gone.map((reason) => (
                <li
                  key={reason.id}
                  className="rounded-md border border-border p-2 text-muted-foreground"
                >
                  <span data-testid={`cancel-reason-row-${reason.id}`}>
                    <DataText>{name(reason)}</DataText>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }

  return (
    <div className="grid w-full gap-6" data-testid="cancel-reasons-list">
      <title>{t('list.title')}</title>
      <PageHeader
        title={t('list.title')}
        primary={{
          label: t('list.new'),
          allowed: access.create,
          onPress: () => setOpen({}),
          testId: 'cancel-reason-new',
        }}
        filterBar={
          <div className="flex items-center gap-3">
            <Switch
              checked={archived}
              onChange={setArchived}
              aria-labelledby={switchLabel}
              data-testid="cancel-reasons-archived"
            />
            <span id={switchLabel} className="text-sm font-semibold">
              {t('list.showArchived')}
            </span>
          </div>
        }
      />
      {alert === null ? null : <FormAlert problem={alert} data-testid="cancel-reasons-alert" />}
      {content}
      {open === null ? null : (
        <CancelReasonDialog
          {...(open.reason === undefined ? {} : { reason: open.reason })}
          onClose={() => setOpen(null)}
          onReload={async () => {
            const fresh = (await reasons.refetch({ throwOnError: true })).data ?? [];
            const stored = fresh.find((reason) => reason.id === open.reason?.id);
            // Gone from the list meanwhile (archived): nothing is left to edit.
            if (stored === undefined || stored.archived_at !== null) setOpen(null);
            return stored;
          }}
        />
      )}
      <ConfirmDialog
        open={archiving !== null}
        title={t('archive.title')}
        consequence={archiving === null ? '' : t('archive.confirm', { name: name(archiving) })}
        confirmLabel={t('archive.action')}
        destructive
        onConfirm={confirmArchive}
        onCancel={() => setArchiving(null)}
      />
    </div>
  );
}
