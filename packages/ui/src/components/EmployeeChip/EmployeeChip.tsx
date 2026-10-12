'use client';

import { initialsOf } from '@point/shared';

import { DataText } from '../DataText/DataText';

// A person in a list or a card (AD-CMP-09 · AD-VIS-12 · design D10): the photo, or the initials on a
// neutral background, always with the full display name — never an avatar alone — and the branch when
// given. With `onOpenProfile` the chip is a button; without it, plain text.

export interface EmployeeChipProps {
  /** The display name, in the language the screen shows it (Myanmar names keep `lang="my"`). */
  readonly name: string;
  readonly photoUrl?: string;
  readonly branch?: string;
  readonly onOpenProfile?: () => void;
}

export function EmployeeChip({ name, photoUrl, branch, onOpenProfile }: EmployeeChipProps) {
  const avatar =
    photoUrl === undefined ? (
      <span
        aria-hidden
        data-slot="initials"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
      >
        <DataText>{initialsOf(name)}</DataText>
      </span>
    ) : (
      // Decorative: the name next to it says who it is.
      <img src={photoUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
    );
  const text = (
    <span className="flex min-w-0 flex-col text-start">
      <span className="text-sm font-semibold break-words">
        <DataText>{name}</DataText>
      </span>
      {branch === undefined ? null : (
        <span className="text-xs text-muted-foreground">
          <DataText>{branch}</DataText>
        </span>
      )}
    </span>
  );
  if (onOpenProfile === undefined) {
    return (
      <span data-slot="employee-chip" className="inline-flex items-center gap-2">
        {avatar}
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-slot="employee-chip"
      onClick={onOpenProfile}
      className="relative inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-start hover:bg-muted"
    >
      {avatar}
      {text}
    </button>
  );
}
