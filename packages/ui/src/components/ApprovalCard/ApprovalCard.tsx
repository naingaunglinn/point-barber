'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import type { Instant } from '@point/shared';

import { Button } from '../Button/Button';
import { DataText } from '../DataText/DataText';
import { DateText } from '../DateText/DateText';
import { EmployeeChip, type EmployeeChipProps } from '../EmployeeChip/EmployeeChip';
import { TextInput } from '../TextInput/TextInput';

// A request waiting for a decision (AD-NTF-04 · AD-POS-16 · AD-PERM-02 · design D10): the requester as an
// EmployeeChip, the branch, the facts, the resulting value emphasised and the reason; "Approve" and
// "Reject" (with a note) only when the caller marks the user as allowed to decide. Properties only.

export interface ApprovalFact {
  /** Translated. */
  readonly label: string;
  /** Formatted (MoneyText …). */
  readonly value: ReactNode;
}

export interface ApprovalCardProps {
  /** Translated ("Discount request"). */
  readonly title: string;
  readonly requester: EmployeeChipProps;
  readonly branch: string;
  readonly facts: readonly ApprovalFact[];
  /** The request's reason, as entered. */
  readonly reason: string;
  /** The value the decision results in, emphasised. */
  readonly result?: ApprovalFact;
  readonly requestedAt?: Instant;
  readonly canDecide: boolean;
  readonly onApprove: () => void | Promise<unknown>;
  readonly onReject: (note: string) => void | Promise<unknown>;
}

export function ApprovalCard(props: ApprovalCardProps) {
  const {
    title,
    requester,
    branch,
    facts,
    reason,
    result,
    requestedAt,
    canDecide,
    onApprove,
    onReject,
  } = props;
  const t = useTranslations('common.action');
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  return (
    <article
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      data-slot="approval-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {requestedAt === undefined ? null : (
          <span className="text-sm text-muted-foreground">
            <DateText value={requestedAt} mode="datetime" />
          </span>
        )}
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <EmployeeChip {...requester} branch={requester.branch ?? branch} />
      </div>
      <dl className="flex flex-col gap-1" data-slot="facts">
        {facts.map((fact) => (
          <div key={fact.label} className="flex justify-between gap-3 text-sm">
            <dt>{fact.label}</dt>
            <dd className="font-numeric">{fact.value}</dd>
          </div>
        ))}
        {result === undefined ? null : (
          <div
            className="flex justify-between gap-3 border-t border-border pt-1 text-base font-bold"
            data-slot="result"
          >
            <dt>{result.label}</dt>
            <dd className="font-numeric">{result.value}</dd>
          </div>
        )}
      </dl>
      <p className="text-sm text-muted-foreground" data-slot="reason">
        <DataText>{reason}</DataText>
      </p>
      {!canDecide ? null : rejecting ? (
        <div className="flex flex-col gap-2">
          <TextInput multiline aria-label={t('reject')} value={note} onChange={setNote} />
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button onClick={() => setRejecting(false)}>{t('goBack')}</Button>
            <Button variant="destructive" onClick={() => onReject(note.trim())}>
              {t('reject')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button variant="destructive" onClick={() => setRejecting(true)}>
            {t('reject')}
          </Button>
          <Button variant="primary" onClick={onApprove}>
            {t('approve')}
          </Button>
        </div>
      )}
    </article>
  );
}
