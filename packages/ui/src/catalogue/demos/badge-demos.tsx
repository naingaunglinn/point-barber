'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { localized, STATUS_BY_TABLE, type StatusTable } from '@point/shared';

import { DataText } from '../../components/DataText/DataText';
import { EmployeeChip } from '../../components/EmployeeChip/EmployeeChip';
import { FlagChip } from '../../components/FlagChip/FlagChip';
import { StatusBadge, type StatusBadgeProps } from '../../components/StatusBadge/StatusBadge';
import { useFormat } from '../../providers/format';
import { DERIVED_STATES, FLAGS, STATUS_MAP, type FlagKey } from '../../status/status-map';
import { HandlerLog } from '../demo-frame';
import { BRANCHES, PEOPLE } from '../fixtures';

// Badges and chips demos (task 9.4 · AD-CMP-05 · AD-CMP-06 · AD-CMP-09 · AD-VIS-12 v1.8 · AD-L10N-03 ·
// design D8 / D12): every (table, status) pair of the one map and its derived states, every flag, the
// employee chip with and without a photo, and DataText marking Myanmar text.

const TABLES = Object.keys(STATUS_MAP) as StatusTable[];

export function StatusMapDemo() {
  return (
    <div className="flex flex-col gap-3" data-testid="status-map">
      {TABLES.map((table) => (
        <div key={table} className="flex flex-col gap-1">
          <code className="text-xs text-muted-foreground" lang="en">
            {table}
          </code>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_BY_TABLE[table]).map(([name, code]) => (
              <StatusBadge key={name} {...({ table, code } as StatusBadgeProps)} />
            ))}
            {table in DERIVED_STATES
              ? Object.keys(DERIVED_STATES[table as keyof typeof DERIVED_STATES]).map((state) => (
                  <StatusBadge key={state} {...({ table, state } as StatusBadgeProps)} />
                ))
              : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Counts for the flags that take one; `proxy_recorded` names Ko Min. */
const FLAG_COUNTS: Partial<Record<FlagKey, number>> = {
  transfer_short: 2,
  transfer_over: 1,
  reopened: 1,
};

export function FlagsDemo() {
  const { locale } = useFormat('FlagChip demo');
  return (
    <div className="flex flex-wrap gap-2" data-testid="flags">
      {(Object.keys(FLAGS) as FlagKey[]).map((flag) => {
        const name = flag === 'proxy_recorded' ? localized(PEOPLE.min, 'name', locale) : undefined;
        return <FlagChip key={flag} flag={flag} name={name} count={FLAG_COUNTS[flag]} />;
      })}
    </div>
  );
}

/** A generated silhouette — never a real face (CG-SEC-11). No fill: it draws in black on transparency. */
const PLACEHOLDER_PHOTO =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='12' r='6'/><path d='M4 30c0-7 5-11 12-11s12 4 12 11z'/></svg>";

export function EmployeeChipDemo() {
  const log = useTranslations('devui.log');
  const { locale } = useFormat('EmployeeChip demo');
  const [opened, setOpened] = useState('');
  const b3 = BRANCHES.find((branch) => branch.code === 'B3');
  const branch = b3 === undefined ? undefined : localized(b3, 'name', locale);
  const aung = localized(PEOPLE.aung, 'name', locale);
  const min = localized(PEOPLE.min, 'name', locale);
  return (
    <div className="flex flex-col gap-3">
      <EmployeeChip name={aung} branch={branch} />
      <EmployeeChip name={min} photoUrl={PLACEHOLDER_PHOTO} branch={branch} />
      <EmployeeChip name={min} onOpenProfile={() => setOpened(log('profile', { name: min }))} />
      <HandlerLog label={log('label')} value={opened} />
    </div>
  );
}

export function DataTextDemo() {
  const { locale } = useFormat('DataText demo');
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {Object.values(PEOPLE).map((person) => (
        <li key={person.code}>
          <DataText>{localized(person, 'name', locale)}</DataText>
        </li>
      ))}
    </ul>
  );
}
