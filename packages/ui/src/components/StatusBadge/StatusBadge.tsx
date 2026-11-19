'use client';

import { cn } from 'cn';
import { useTranslations } from 'next-intl';

import { STATUS_BY_TABLE, type StatusCode, type StatusTable } from '@point/shared';

import {
  DERIVED_STATES,
  iconsOf,
  STATUS_MAP,
  type DerivedTable,
  type StatusStyle,
} from '../../status/status-map';
import { TONE_CLASS, ToneIcons } from '../../status/tone';

// The status of a record (D-DB-03 · API-DATA-04 · AD-CMP-05 · AD-IMPL-04 · AD-A11Y-03 · design D8): a
// status column's code, or a derived state by name; tone, icon and label only from the status map —
// the label key is `status.<table>.<NAME>`. Every badge shows an icon and its text.

type CodeProps = {
  [T in StatusTable]: { readonly table: T; readonly code: StatusCode<T>; readonly state?: never };
}[StatusTable];
type StateProps = {
  [T in DerivedTable]: {
    readonly table: T;
    readonly state: keyof (typeof DERIVED_STATES)[T];
    readonly code?: never;
  };
}[DerivedTable];

export type StatusBadgeProps = CodeProps | StateProps;

function nameOf(table: StatusTable, code: number): string {
  const entry = Object.entries(STATUS_BY_TABLE[table]).find(([, value]) => value === code);
  if (entry === undefined) throw new RangeError(`No status ${code} in ${table}`);
  return entry[0];
}

export function StatusBadge(props: StatusBadgeProps) {
  const t = useTranslations('status');
  const { table } = props;
  const name =
    props.code === undefined ? String(props.state) : nameOf(props.table as StatusTable, props.code);
  const source = (props.code === undefined ? DERIVED_STATES : STATUS_MAP) as unknown as Record<
    string,
    Record<string, StatusStyle>
  >;
  const style = source[table]?.[name];
  if (style === undefined) throw new RangeError(`No status map entry for ${table}.${name}`);
  // The key is built from the map; pnpm i18n:check proves every one of them exists in both languages.
  const label = (t as unknown as (key: string) => string)(`${table}.${name}`);
  return (
    <span
      data-slot="status-badge"
      data-tone={style.tone}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold',
        TONE_CLASS[style.tone],
      )}
    >
      <ToneIcons names={iconsOf(style)} />
      <span>{label}</span>
    </span>
  );
}
