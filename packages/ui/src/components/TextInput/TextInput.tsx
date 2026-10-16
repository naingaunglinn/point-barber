'use client';

import { cn } from 'cn';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { normalizeMyanmarText } from '@point/shared';

import { Input } from '../../primitives/input';
import { Textarea } from '../../primitives/textarea';

// The shared text input for names, notes and reasons (AD-FORM-13 · AD-L10N-07 · design D10 / D11): when
// the user leaves it, Zawgyi-encoded Myanmar text is converted to Unicode, the field shows the
// converted text and a notice (`common.zawgyi.converted`) asks the user to check it. Unicode text is
// left as it is. 16 px text, a 48 / 40 px single line.

export interface TextInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly multiline?: boolean;
  readonly maxLength?: number;
  readonly placeholder?: string;
  /** `my` for a Myanmar field (font and line-height of AD-VIS-06). */
  readonly lang?: 'my' | 'en';
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly id?: string;
  readonly name?: string;
  readonly onBlur?: () => void;
  readonly 'aria-label'?: string;
  /** Labels the field by a visible element elsewhere (a heading) instead of `aria-label`. */
  readonly 'aria-labelledby'?: string;
  readonly 'aria-invalid'?: true;
  readonly 'aria-describedby'?: string;
  readonly 'aria-required'?: true;
}

export function TextInput({
  value,
  onChange,
  multiline = false,
  onBlur,
  'aria-describedby': describedBy,
  ...control
}: TextInputProps) {
  const t = useTranslations('common');
  const noticeId = useId();
  const [converted, setConverted] = useState(false);
  const described =
    [describedBy, converted ? noticeId : null].filter(Boolean).join(' ') || undefined;

  const shared = {
    ...control,
    value,
    'aria-describedby': described,
    onChange: (event: { target: { value: string } }) => {
      setConverted(false);
      onChange(event.target.value);
    },
    onBlur: () => {
      const result = normalizeMyanmarText(value);
      if (result.converted) {
        onChange(result.text);
        setConverted(true);
      }
      onBlur?.();
    },
  };

  return (
    <div className="flex flex-col gap-1" data-slot="text-input">
      {multiline ? (
        <Textarea {...shared} className="min-h-24 text-base" />
      ) : (
        <Input {...shared} type="text" className={cn('h-12 text-base md:h-10')} />
      )}
      {converted ? (
        <p id={noticeId} data-slot="zawgyi-notice" className="text-sm text-muted-foreground">
          {t('zawgyi.converted')}
        </p>
      ) : null}
    </div>
  );
}
