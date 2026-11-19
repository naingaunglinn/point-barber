'use client';

import { Switch as SwitchPrimitive } from '../../primitives/switch';

// An on / off switch (AD-SET-01 "a control matching the type … switch" · D-UX-02 — existing tokens only ·
// add-settings-store task 5.1): the shadcn/ui switch of ../../primitives, a `role="switch"` button with
// `aria-checked`. It is named by a visible label (`aria-labelledby`, e.g. FormField's) or `aria-label`;
// Space and Enter toggle it, and its hit area is 44 px tall (AD-A11Y-05).

export interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly 'aria-label'?: string;
  /** Labels the switch by a visible element elsewhere (a row label) instead of `aria-label`. */
  readonly 'aria-labelledby'?: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: true;
  readonly 'data-testid'?: string;
}

export function Switch({ checked, onChange, disabled = false, ...rest }: SwitchProps) {
  return (
    <SwitchPrimitive checked={checked} onCheckedChange={onChange} disabled={disabled} {...rest} />
  );
}
