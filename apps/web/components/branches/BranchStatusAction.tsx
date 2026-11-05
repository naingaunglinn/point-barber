'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import type { Locale } from '@point/i18n';
import {
  type Branch,
  type BranchInUseContext,
  BranchLimits,
  BranchStatus,
  ErrorCode,
  type Problem,
  branchInUseContextSchema,
  localized,
} from '@point/shared';
import { type Action, FormAlert, ReasonDialog } from '@point/ui';

import { ApiProblem } from '../../lib/api/client';
import { useBranchAccess } from '../../lib/branches/access';
import { useSetBranchStatus } from '../../lib/branches/queries';

// The status action of the detail header (add-branch-management spec "The detail page deactivates and
// re-activates a branch for company-scope branch.delete holders" · AD-DET-01 · AD-RSN-01 · AD-CONF-02 ·
// AD-LAY-04 · design D9 · task 4.7): only with company-scope branch.delete. Deactivate (destructive —
// behind the header's kebab) opens the reason dialog with the consequence and an optional reason of at
// most 500 characters; a 409 `branch_in_use` stays inside the dialog with the three counts and the branch
// stays ACTIVE. Re-activate sends at once (a routine, reversible save — AD-CONF-01). After either, the
// header shows the branch the API answered.

export interface BranchStatusAction {
  /** The header's action, or null when the user may not change the status. */
  readonly action: Action | null;
  /** The deactivate dialog. */
  readonly dialog: ReactNode;
  /** A refused re-activation, for the top of the page. */
  readonly alert: ReactNode;
}

/** A refusal of a status change; a request that got no answer is `unknown`. */
type Refusal = Pick<Problem, 'code' | 'request_id'> & { readonly context?: unknown };

function refusalOf(error: unknown): Refusal {
  return error instanceof ApiProblem ? error.problem : { code: 'unknown', request_id: '' };
}

/** The three counts of a 409 `branch_in_use`, or null for another refusal. */
function inUseOf(refusal: Refusal): BranchInUseContext | null {
  if (refusal.code !== ErrorCode.BRANCH_IN_USE) return null;
  const parsed = branchInUseContextSchema.safeParse(refusal.context);
  return parsed.success ? parsed.data : null;
}

export function useBranchStatusAction(branch: Branch): BranchStatusAction {
  const t = useTranslations('branch');
  const locale = useLocale() as Locale;
  const access = useBranchAccess();
  const setStatus = useSetBranchStatus(branch.id);
  const [asking, setAsking] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [reactivateRefusal, setReactivateRefusal] = useState<Refusal | null>(null);

  const close = () => {
    setAsking(false);
    setRefusal(null);
  };
  const inUse = refusal === null ? null : inUseOf(refusal);
  const active = branch.status === BranchStatus.ACTIVE;

  const action: Action | null = !access.setStatus
    ? null
    : active
      ? {
          label: t('action.deactivate'),
          destructive: true,
          testId: 'branch-deactivate',
          onPress: () => {
            setRefusal(null);
            setAsking(true);
          },
        }
      : {
          label: t('action.reactivate'),
          testId: 'branch-reactivate',
          onPress: async () => {
            setReactivateRefusal(null);
            try {
              await setStatus.mutateAsync({ status: BranchStatus.ACTIVE });
            } catch (error) {
              setReactivateRefusal(refusalOf(error));
            }
          },
        };

  const dialog = (
    <ReasonDialog
      open={asking}
      title={t('deactivate.title')}
      consequence={t('deactivate.consequence', { name: localized(branch, 'name', locale) })}
      source={{ type: 'free' }}
      note="optional"
      noteLabel={t('deactivate.reason')}
      noteMaxLength={BranchLimits.REASON_MAX}
      keepLabel={t('deactivate.keep')}
      confirmLabel={t('deactivate.confirm')}
      destructive
      alert={
        refusal === null ? null : inUse === null ? (
          <FormAlert problem={refusal} />
        ) : (
          <FormAlert problem={refusal} params={inUse} data-testid="branch-in-use" />
        )
      }
      onCancel={close}
      onConfirm={async (result) => {
        setRefusal(null);
        try {
          await setStatus.mutateAsync({
            status: BranchStatus.INACTIVE,
            ...(result.note === null || result.note === undefined ? {} : { reason: result.note }),
          });
          close();
        } catch (error) {
          setRefusal(refusalOf(error));
        }
      }}
    />
  );

  return {
    action,
    dialog,
    alert: reactivateRefusal === null ? null : <FormAlert problem={reactivateRefusal} />,
  };
}
