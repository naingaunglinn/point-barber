'use client';

import { ChevronDown, Store } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useState } from 'react';

import { localized } from '@point/shared';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu';
import { useFormat } from '../../providers/format';
import { branchKey, readStored, writeStored } from '../../storage/device-storage';
import { Button } from '../Button/Button';
import { DataText } from '../DataText/DataText';

// The branch context (AD-NAV-04 · AD-PERM-04 · D-DSH-01 · D-ROLE-03 · design D10): only the branches in
// the user's scope; "All branches" only for a company-scope user (`allowAll`, decided by the caller from
// the grants). The choice is mirrored in the address as `?branch=<code>` (`all` for all branches) and
// stored per user on the device. It resolves: the address (when in scope) → the stored choice (when
// still in scope) → the caller's `value`; a resolved choice that differs from `value` is reported once.

export interface SwitcherBranch {
  readonly id: string;
  readonly code: string;
  readonly name_mm: string;
  readonly name_en?: string | null;
}

/** The choice that stands for every branch in scope. */
export const ALL_BRANCHES = 'all';

export interface BranchSwitcherProps {
  /** The branches in scope (`/me` → `branches_in_scope`). */
  readonly branches: readonly SwitcherBranch[];
  /** A branch id, or `all`. */
  readonly value: string;
  /** Whose choice it is on this device. */
  readonly userId: string;
  readonly allowAll?: boolean;
  /** Mirror the choice in `?branch=` (default true). */
  readonly syncToUrl?: boolean;
  readonly onChange: (choice: string) => void;
}

const isString = (value: unknown): value is string => typeof value === 'string';

export function BranchSwitcher(props: BranchSwitcherProps) {
  const { branches, value, userId, allowAll = false, syncToUrl = true, onChange } = props;
  const t = useTranslations('common.branch');
  const { locale } = useFormat('BranchSwitcher');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [stored, setStored] = useState<{ readonly userId: string; readonly choice?: string }>();
  const [picked, setPicked] = useState<{ readonly userId: string; readonly choice: string }>();

  // Device storage is read after mounting, so the server and the first client render agree.
  useEffect(() => setStored({ userId, choice: readStored(branchKey(userId), isString) }), [userId]);

  const inScope = (choice: string | undefined): choice is string =>
    choice !== undefined &&
    (choice === ALL_BRANCHES ? allowAll : branches.some((branch) => branch.id === choice));
  const code = syncToUrl ? searchParams.get('branch') : null;
  const fromUrl =
    code === ALL_BRANCHES ? ALL_BRANCHES : branches.find((branch) => branch.code === code)?.id;
  const candidates = [
    picked?.userId === userId ? picked.choice : undefined,
    fromUrl,
    stored?.userId === userId ? stored.choice : undefined,
  ];
  const resolved = candidates.find(inScope) ?? value;

  // A resolution is reported once, not on every render of a caller that keeps an older value.
  const report = useEffectEvent((choice: string) => {
    if (choice !== value) onChange(choice);
  });
  useEffect(() => report(resolved), [resolved]);

  const choose = (choice: string) => {
    setPicked({ userId, choice });
    writeStored(branchKey(userId), choice);
    if (syncToUrl) {
      const params = new URLSearchParams(window.location.search);
      const branch = branches.find((item) => item.id === choice);
      params.set('branch', branch?.code ?? ALL_BRANCHES);
      // Next.js keeps useSearchParams in step with history.replaceState, without a server round trip.
      window.history.replaceState(
        null,
        '',
        `${pathname}?${params.toString()}${window.location.hash}`,
      );
    }
    onChange(choice);
  };

  if (branches.length === 0) return null;
  const current = branches.find((branch) => branch.id === resolved);
  const label = current === undefined ? t('all') : localized(current, 'name', locale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" icon={<Store />} data-slot="branch-switcher">
          <DataText>{label}</DataText>
          <ChevronDown aria-hidden className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={resolved} onValueChange={choose}>
          {allowAll ? (
            <DropdownMenuRadioItem value={ALL_BRANCHES} className="min-h-11 text-base">
              {t('all')}
            </DropdownMenuRadioItem>
          ) : null}
          {branches.map((branch) => (
            <DropdownMenuRadioItem key={branch.id} value={branch.id} className="min-h-11 text-base">
              <DataText>{localized(branch, 'name', locale)}</DataText>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
