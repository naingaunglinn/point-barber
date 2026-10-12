'use client';

import { useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';

import { Button } from '../../components/Button/Button';
import { LockBanner } from '../../components/LockBanner/LockBanner';
import { DemoToggle, HandlerLog } from '../demo-frame';
import { FixturePermissionGate as PermissionGate, useFixtureCan } from '../fixture-grants';
import { FIXTURE_PERMISSIONS, type FixturePermission } from '../personas';

// Permission demos (task 9.8 · AD-PERM-02 · AD-PERM-03 · AD-PERM-05 · design D7): the "Cancel booking"
// button behind `booking.delete` for the persona of `?as=`, with the day-closed state shown either as a
// disabled button with its reason or as a lock banner; and the can() answers of the persona for the
// seven fixture codes. The demos decide by can() only, never by the persona name (AD-META-06).

const DASH = '—';

export function GateDemo() {
  const t = useTranslations('devui.gate');
  const log = useTranslations('devui.log');
  const [closed, setClosed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pressed, setPressed] = useState('');
  const blocked = closed ? (hidden ? ('hidden' as const) : { reason: t('reason') }) : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <DemoToggle label={t('dayClosed')} checked={closed} onChange={setClosed} />
        <DemoToggle label={t('lockBannerVariant')} checked={hidden} onChange={setHidden} />
      </div>
      {blocked === 'hidden' ? (
        <LockBanner message={t('lockMessage')} correction={{ text: t('correction') }} />
      ) : null}
      <PermissionGate code="booking.delete" branchId="B3" blocked={blocked}>
        <div>
          <Button variant="destructive" onClick={() => setPressed(log('cancelBooking'))}>
            {t('cancelBooking')}
          </Button>
        </div>
      </PermissionGate>
      <HandlerLog label={log('label')} value={pressed} />
    </div>
  );
}

type Answer = boolean | null;

export function CanTableDemo() {
  const t = useTranslations('devui.can');
  const can = useFixtureCan() as (code: string, options?: object) => boolean;
  const rows = (Object.keys(FIXTURE_PERMISSIONS) as FixturePermission[]).map((code) => {
    const { level } = FIXTURE_PERMISSIONS[code];
    const branchChecks = level !== 'company';
    const companyCheck = level !== 'branch';
    const answers: readonly Answer[] = [
      can(code),
      branchChecks ? can(code, { branchId: 'B3' }) : null,
      branchChecks ? can(code, { branchId: 'B1' }) : null,
      companyCheck ? can(code, { level: 'company' }) : null,
    ];
    return { code, level, answers };
  });
  const cell = (answer: Answer) => (answer === null ? DASH : answer ? t('yes') : t('no'));
  const columns = [t('any'), t('atB3'), t('atB1'), t('company')];
  return (
    <>
      {/* One entry per code below 768 px, so nothing scrolls sideways (AD-LIST-02). */}
      <ul className="flex flex-col text-sm md:hidden">
        {rows.map(({ code, level, answers }) => (
          <li key={code} className="flex flex-col gap-1 border-b border-border py-2">
            <p className="flex flex-wrap gap-x-3" lang="en">
              <code className="font-semibold">{code}</code>
              <code className="text-muted-foreground">{level}</code>
            </p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
              {answers.map((answer, index) => (
                <Fragment key={index}>
                  <dt>{columns[index]}</dt>
                  <dd>{cell(answer)}</dd>
                </Fragment>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm" data-testid="can-table">
          <thead>
            <tr className="border-b border-border text-start">
              <th scope="col" className="py-2 pe-3 text-start">
                {t('code')}
              </th>
              <th scope="col" className="py-2 pe-3 text-start">
                {t('level')}
              </th>
              <th scope="col" className="py-2 pe-3 text-start">
                {t('any')}
              </th>
              <th scope="col" className="py-2 pe-3 text-start">
                {t('atB3')}
              </th>
              <th scope="col" className="py-2 pe-3 text-start">
                {t('atB1')}
              </th>
              <th scope="col" className="py-2 pe-3 text-start">
                {t('company')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ code, level, answers }) => (
              <tr key={code} className="border-b border-border" data-code={code}>
                <td className="py-2 pe-3" lang="en">
                  <code>{code}</code>
                </td>
                <td className="py-2 pe-3" lang="en">
                  <code>{level}</code>
                </td>
                {answers.map((answer, index) => (
                  <td key={index} className="py-2 pe-3" data-answer={String(answer)}>
                    {cell(answer)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
