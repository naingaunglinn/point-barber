'use client';

import { cva } from 'class-variance-authority';
import { cn } from 'cn';
import { LoaderCircle } from 'lucide-react';
import {
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';

// The one button of the system (AD-CMP-01 · AD-LAY-04 · AD-A11Y-05 · AD-NET-01 · design D10): four
// variants; 48 px high below 768 px and 40 px from 768 px, with an invisible area that keeps the
// touch target at 44 px or more; the focus outline of tokens.css (`--focus-outline`). While its action
// runs it keeps its label, shows a spinner and stays disabled, so a double tap calls the action once.

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-sm font-semibold whitespace-nowrap select-none',
    'transition-colors duration-[var(--motion-fast)] disabled:pointer-events-none disabled:opacity-50',
    "after:absolute after:content-[''] [&_svg]:size-5 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'border-border bg-secondary text-secondary-foreground hover:bg-muted',
        ghost: 'border-transparent bg-transparent text-foreground hover:bg-muted',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      shape: {
        label: 'h-12 px-4 after:inset-x-0 after:-inset-y-0.5 md:h-10',
        icon: 'size-12 after:-inset-0.5 md:size-10',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
  },
);

/** Attributes a wrapper may add (a Radix trigger, a menu): passed on to the `<button>`. */
type PassedAttributes = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | 'children'
  | 'className'
  | 'disabled'
  | 'form'
  | 'onClick'
  | 'type'
  | 'aria-label'
  | 'aria-labelledby'
>;

interface CommonProps extends PassedAttributes {
  readonly ref?: Ref<HTMLButtonElement>;
  /** Default `secondary`; one `primary` per view (AD-CMP-01). */
  readonly variant?: ButtonVariant;
  /** Set by the caller while its request runs; the button also tracks a promise its `onClick` returns. */
  readonly loading?: boolean;
  readonly icon?: ReactNode;
  readonly fullWidth?: boolean;
  /** Disabled, with this sentence (translated) shown under the button and linked as its description. */
  readonly disabledReason?: string;
  readonly disabled?: boolean;
  readonly type?: 'button' | 'submit';
  readonly form?: string;
  readonly className?: string;
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
}

interface LabelledProps extends CommonProps {
  /** A verb from the language files ("Take payment"), never "OK" (AD-CMP-01). */
  readonly children: ReactNode;
  readonly iconOnly?: false;
  readonly 'aria-label'?: string;
}

interface IconOnlyBase extends CommonProps {
  readonly iconOnly: true;
  readonly icon: ReactNode;
  readonly children?: never;
}

/** Required: an icon alone has no name (AD-A11Y-05) — a translated label, or the id of a label element. */
type IconOnlyProps = IconOnlyBase &
  (
    | { readonly 'aria-label': string; readonly 'aria-labelledby'?: never }
    | { readonly 'aria-labelledby': string; readonly 'aria-label'?: never }
  );

export type ButtonProps = LabelledProps | IconOnlyProps;

export function Button(props: ButtonProps) {
  const {
    variant = 'secondary',
    loading = false,
    icon,
    fullWidth = false,
    disabledReason,
    disabled = false,
    type = 'button',
    form,
    className,
    onClick,
    iconOnly = false,
    children,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    ...passed
  } = props as LabelledProps &
    Partial<Omit<IconOnlyBase, 'iconOnly' | 'icon' | 'children'>> & {
      readonly iconOnly?: boolean;
      readonly 'aria-labelledby'?: string;
    };
  const reasonId = useId();
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const busy = loading || pending;
  const blocked = disabled || disabledReason !== undefined;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy || blocked || running.current) return;
    const result = onClick?.(event);
    if (!(result instanceof Promise)) return;
    running.current = true;
    setPending(true);
    // The failure stays the caller's: `finally` passes the rejection on (CG-ERR-01).
    void result.finally(() => {
      running.current = false;
      setPending(false);
    });
  };

  const button = (
    <button
      {...passed}
      type={type}
      form={form}
      data-variant={variant}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-busy={busy || undefined}
      aria-describedby={disabledReason === undefined ? undefined : reasonId}
      disabled={busy || blocked}
      className={cn(
        buttonVariants({ variant, shape: iconOnly ? 'icon' : 'label', fullWidth }),
        className,
      )}
      onClick={handleClick}
    >
      {busy ? (
        <LoaderCircle
          data-slot="spinner"
          aria-hidden
          className="animate-spin motion-reduce:animate-none"
        />
      ) : (
        icon
      )}
      {iconOnly ? null : children}
    </button>
  );

  if (disabledReason === undefined) return button;
  return (
    <span className={cn('inline-flex flex-col gap-1', fullWidth && 'w-full')}>
      {button}
      <span id={reasonId} className="text-sm text-muted-foreground">
        {disabledReason}
      </span>
    </span>
  );
}
