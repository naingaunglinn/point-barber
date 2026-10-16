'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { BusinessDate, Mmk } from '@point/shared';

import { BilingualInput, type Bilingual } from '../../components/BilingualInput/BilingualInput';
import { DateInput } from '../../components/DateInput/DateInput';
import { DateText } from '../../components/DateText/DateText';
import { MoneyInput } from '../../components/MoneyInput/MoneyInput';
import { MoneyText } from '../../components/MoneyText/MoneyText';
import { PhoneInput, type PhoneValue } from '../../components/PhoneInput/PhoneInput';
import { TextInput } from '../../components/TextInput/TextInput';
import { HandlerLog } from '../demo-frame';
import { useDemoTitleId } from '../demo-title';
import { DATES, DEMO_SALES } from '../fixtures';

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
