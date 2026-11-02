'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { localized, type BusinessDate, type Mmk } from '@point/shared';

import { BilingualInput, type Bilingual } from '../../components/BilingualInput/BilingualInput';
import { ChoiceGroup, type ChoiceOption } from '../../components/ChoiceGroup/ChoiceGroup';
import { DateInput } from '../../components/DateInput/DateInput';
import { DateText } from '../../components/DateText/DateText';
import { MoneyInput } from '../../components/MoneyInput/MoneyInput';
import { MoneyText } from '../../components/MoneyText/MoneyText';
import { PhoneInput, type PhoneValue } from '../../components/PhoneInput/PhoneInput';
import { TextInput } from '../../components/TextInput/TextInput';
import { useFormat } from '../../providers/format';
import { HandlerLog } from '../demo-frame';
import { useDemoTitleId } from '../demo-title';
import { BOOKING_CANCEL_REASONS, DATES, DEMO_SALES } from '../fixtures';

// Input demos (task 9.3 · AD-FORM-09..15 · AD-FMT-01 · AD-FMT-02 · D-PLT-04 · D-PLT-05 · design D12):
// each shows the value it reports, so the spec cases can be read off the page. The demo's title names the
// field, so the control takes that name as its accessible name instead of repeating it as a label (the
// label above a control is the FormField demo's subject).

export function MoneyInputDemo() {
  const titleId = useDemoTitleId();
  const log = useTranslations('devui.log');
  const [value, setValue] = useState<Mmk | null>(null);
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <MoneyInput aria-labelledby={titleId} value={value} onChange={setValue} />
      <HandlerLog label={log('reported')} value={value === null ? 'null' : String(value)} />
    </div>
  );
}

export function MoneyTextDemo() {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {DEMO_SALES.map((sale) => (
        <li key={sale.receiptNo} className="flex justify-between gap-4">
          <span lang="en">{sale.receiptNo}</span>
          <MoneyText amount={sale.amount} />
        </li>
      ))}
    </ul>
  );
}

export function PhoneInputDemo() {
  const titleId = useDemoTitleId();
  const log = useTranslations('devui.log');
  const [value, setValue] = useState<PhoneValue>({ raw: '', e164: null });
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <PhoneInput aria-labelledby={titleId} value={value.raw} onChange={setValue} />
      <HandlerLog label={log('reported')} value={JSON.stringify(value)} />
    </div>
  );
}

export function BilingualInputDemo() {
  const log = useTranslations('devui.log');
  const [value, setValue] = useState<Bilingual>({ mm: '', en: null });
  return (
    <div className="flex max-w-sm flex-col gap-2">
      {/* The pair labels its own two inputs (Myanmar, required; English). */}
      <BilingualInput value={value} onChange={setValue} />
      <HandlerLog label={log('reported')} value={JSON.stringify(value)} />
    </div>
  );
}

export function TextInputDemo() {
  const titleId = useDemoTitleId();
  const log = useTranslations('devui.log');
  const [value, setValue] = useState('');
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <TextInput aria-labelledby={titleId} multiline value={value} onChange={setValue} />
      <HandlerLog label={log('reported')} value={JSON.stringify(value)} />
    </div>
  );
}

export function DateInputDemo() {
  const titleId = useDemoTitleId();
  const log = useTranslations('devui.log');
  const [value, setValue] = useState<BusinessDate | null>(null);
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <DateInput aria-labelledby={titleId} value={value} onChange={setValue} />
      <HandlerLog label={log('reported')} value={value ?? 'null'} />
    </div>
  );
}

/** Today, yesterday and an older date at the catalogue clock (05/Oct/2026). */
const RELATIVE_DAYS: readonly BusinessDate[] = [DATES.today, DATES.yesterday, '2026-10-03'];

export function DateTextDemo() {
  return (
    <ul className="flex flex-col gap-1 text-sm" data-testid="date-text-relative">
      {RELATIVE_DAYS.map((day) => (
        <li key={day} className="flex flex-wrap gap-x-4">
          <code lang="en">{day}</code>
          <DateText value={day} relativeDay />
        </li>
      ))}
      <li className="flex flex-wrap gap-x-4">
        <code lang="en">{DATES.finish}</code>
        <DateText value={DATES.finish} mode="datetime" />
      </li>
    </ul>
  );
}

/** The booking cancel reasons of the fixture, then "Reason 5" … up to `count` (task 11.31). */
function useReasonChoices(count: number): readonly ChoiceOption[] {
  const t = useTranslations('devui.reasons');
  const { locale } = useFormat('ChoiceGroup demo');
  const seed = BOOKING_CANCEL_REASONS.slice(0, count).map((reason) =>
    localized(reason, 'name', locale),
  );
  const extra = Array.from({ length: Math.max(0, count - seed.length) }, (_, index) =>
    t('extra', { n: seed.length + index + 1 }),
  );
  return [...seed, ...extra].map((label, index) => ({
    value: `reason-${index + 1}`,
    label,
    testId: `choice-reason-${index + 1}`,
  }));
}

/** AD-FORM-14: 7 options are a radio group, 8 a searchable combobox; the log shows what is reported. */
function ChoiceDemo({ count }: { readonly count: number }) {
  const t = useTranslations('devui.inputs');
  const log = useTranslations('devui.log');
  const options = useReasonChoices(count);
  const [value, setValue] = useState<string | null>(null);
  return (
    <div className="flex max-w-sm flex-col gap-2">
      <ChoiceGroup label={t('reason')} options={options} value={value} onChange={setValue} />
      <HandlerLog label={log('label')} value={value === null ? '' : log('chosen', { value })} />
    </div>
  );
}

export const ChoiceSevenDemo = () => <ChoiceDemo count={7} />;
export const ChoiceEightDemo = () => <ChoiceDemo count={8} />;
