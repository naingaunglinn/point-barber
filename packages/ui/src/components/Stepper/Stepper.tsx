'use client';

import { cn } from 'cn';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

// Where the user is in a multi-step flow (AD-CMP-12 · AD-WIZ-01 · design D10): from 768 px every step in
// a row with connectors — done steps carry a check and can be pressed to go back, later steps cannot;
// below 768 px "Step 2 of 4 · Payment" above a progress bar.

export interface Step {
  readonly key: string;
  /** Translated. */
  readonly label: string;
  readonly state: 'done' | 'current' | 'todo';
}

export interface StepperProps {
  readonly steps: readonly Step[];
  readonly onStepPress?: (key: string) => void;
}

export function Stepper({ steps, onStepPress }: StepperProps) {
  const t = useTranslations('common.stepper');
  const index = Math.max(
    0,
    steps.findIndex((step) => step.state === 'current'),
  );
  const current = steps[index];
  return (
    <div data-slot="stepper">
      <div className="flex flex-col gap-2 md:hidden" data-slot="stepper-compact">
        <p className="text-sm font-semibold">
          {t('compact', { n: index + 1, m: steps.length, name: current?.label ?? '' })}
        </p>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
          aria-valuetext={current?.label}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-primary"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
      <ol className="hidden items-center gap-2 md:flex" data-slot="stepper-row">
        {steps.map((step, i) => {
          const mark = (
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                step.state === 'todo'
                  ? 'border-border text-muted-foreground'
                  : 'border-primary bg-primary text-primary-foreground',
              )}
            >
              {step.state === 'done' ? <Check aria-hidden className="size-4" /> : i + 1}
            </span>
          );
          return (
            <li
              key={step.key}
              className="flex flex-1 items-center gap-2"
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              {step.state === 'done' && onStepPress !== undefined ? (
                <button
                  type="button"
                  className="relative flex min-h-11 items-center gap-2 rounded-md px-1 hover:bg-muted"
                  onClick={() => onStepPress(step.key)}
                >
                  {mark}
                  <span className="text-sm font-semibold">{step.label}</span>
                </button>
              ) : (
                <span className="flex min-h-11 items-center gap-2 px-1">
                  {mark}
                  <span
                    className={cn(
                      'text-sm',
                      step.state === 'todo' ? 'text-muted-foreground' : 'font-semibold',
                    )}
                  >
                    {step.label}
                  </span>
                </span>
              )}
              {i < steps.length - 1 ? (
                <span aria-hidden className="h-px flex-1 bg-border" data-slot="connector" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
