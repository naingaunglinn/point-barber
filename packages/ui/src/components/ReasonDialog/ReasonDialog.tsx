'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { localized } from '@point/shared';

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../primitives/command';
import { RadioGroup, RadioGroupItem } from '../../primitives/radio-group';
import { useFormat } from '../../providers/format';
import { Button } from '../Button/Button';
import { DataText } from '../DataText/DataText';
import { Dialog } from '../Dialog/Dialog';
import { TextInput } from '../TextInput/TextInput';

// Every action that needs a reason (AD-RSN-01 · AD-RSN-02 · API-DATA-11 · AD-FORM-14 · design D9 /
// D10): a title made of verb and object, the consequence, the reason control of its source — the
// admin's master list, a preset code list, or free text — a note, the confirm button with the verb, and
// "Keep" / "Go back". Up to 7 reasons are a radio group, 8 or more a searchable list. Confirming without
// a reason, or without a note the reason needs, shows `error.reason_required` and keeps the dialog
// open. The result is the generic `{ reason_id?, reason_code?, note? }`; the calling screen maps it to
// the field its endpoint defines (API Part 4: `reason`, `added_reason`, `override_reason` …).

export interface MasterReason {
  readonly id: string;
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly requires_note: boolean;
}

export interface PresetReason {
  readonly code: number;
  /** The constant name; its label is `reason.<name>`. */
  readonly name: string;
  readonly requiresNote: boolean;
}

export type ReasonSource =
  | { readonly type: 'master'; readonly options: readonly MasterReason[] }
  | { readonly type: 'preset'; readonly options: readonly PresetReason[] }
  | { readonly type: 'free' };

export interface ReasonResult {
  readonly reason_id?: string;
  readonly reason_code?: number;
  /** Present when the dialog showed a note field: the text, or null when it was left empty. */
  readonly note?: string | null;
}

/**
 * `none`: no note · `optional`: always shown, required when the reason needs it · `by-reason` (default):
 * shown only when the chosen reason needs it · `required`: always shown and required.
 */
export type NoteMode = 'none' | 'optional' | 'by-reason' | 'required';

export interface ReasonDialogProps {
  readonly open: boolean;
  /** Verb and object, translated ("Cancel booking"). */
  readonly title: string;
  /** What will happen, with its numbers (translated). */
  readonly consequence: string;
  readonly source: ReasonSource;
  /** The verb again ("Cancel booking"). */
  readonly confirmLabel: string;
  readonly note?: NoteMode;
  readonly cancelLabel?: 'keep' | 'goBack';
  readonly destructive?: boolean;
  readonly onConfirm: (result: ReasonResult) => void | Promise<unknown>;
  readonly onCancel: () => void;
}

/** Above this many reasons the list is searchable (AD-FORM-14: ≤ 7 → radio group). */
const RADIO_LIMIT = 7;

export function ReasonDialog({
  open,
  title,
  consequence,
  source,
  confirmLabel,
  note: noteMode = 'by-reason',
  cancelLabel = 'keep',
  destructive = false,
  onConfirm,
  onCancel,
}: ReasonDialogProps) {
  const t = useTranslations();
  const { locale } = useFormat('ReasonDialog');
  const ids = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const options =
    source.type === 'master'
      ? source.options.map((o) => ({
          value: o.id,
          label: localized(o, 'name', locale),
          needsNote: o.requires_note,
        }))
      : source.type === 'preset'
        ? source.options.map((o) => ({
            value: String(o.code),
            label: (t as unknown as (key: string) => string)(`reason.${o.name}`),
            needsNote: o.requiresNote,
          }))
        : [];
  const picked = options.find((o) => o.value === chosen);
  const reasonNeedsNote = picked?.needsNote ?? false;
  const free = source.type === 'free';
  const noteShown =
    free ||
    noteMode === 'required' ||
    noteMode === 'optional' ||
    (noteMode === 'by-reason' && reasonNeedsNote);
  const noteRequired = free || noteMode === 'required' || (noteMode !== 'none' && reasonNeedsNote);
  const reasonMissing = !free && chosen === null;
  const noteMissing = noteShown && noteRequired && noteText.trim() === '';

  const reset = () => {
    setChosen(null);
    setNoteText('');
    setShowErrors(false);
  };

  const confirm = () => {
    if (reasonMissing || noteMissing) {
      setShowErrors(true);
      return undefined;
    }
    const text = noteText.trim() === '' ? null : noteText.trim();
    const result: ReasonResult = {
      ...(source.type === 'master' && chosen !== null ? { reason_id: chosen } : {}),
      ...(source.type === 'preset' && chosen !== null ? { reason_code: Number(chosen) } : {}),
      ...(noteShown ? { note: text } : {}),
    };
    const done = onConfirm(result);
    if (done instanceof Promise) return done.then(reset);
    reset();
    return undefined;
  };

  const reasonError = showErrors && reasonMissing;
  const noteError = showErrors && noteMissing;
  const reasonErrorId = `${ids}-reason-error`;
  const noteErrorId = `${ids}-note-error`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        reset();
        onCancel();
      }}
      role="alertdialog"
      title={title}
      description={consequence}
      footer={
        <>
          <Button
            onClick={() => {
              reset();
              onCancel();
            }}
          >
            {t(cancelLabel === 'keep' ? 'common.action.keep' : 'common.action.goBack')}
          </Button>
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {options.length > 0 && options.length <= RADIO_LIMIT ? (
          <RadioGroup
            value={chosen ?? ''}
            onValueChange={(value) => setChosen(value)}
            aria-label={title}
            aria-invalid={reasonError || undefined}
            aria-describedby={reasonError ? reasonErrorId : undefined}
            className="flex flex-col gap-0"
          >
            {options.map((option) => {
              const id = `${ids}-${option.value}`;
              return (
                <label
                  key={option.value}
                  htmlFor={id}
                  className="flex min-h-11 items-center gap-3 rounded-md px-1 hover:bg-muted"
                >
                  <RadioGroupItem id={id} value={option.value} />
                  <DataText>{option.label}</DataText>
                </label>
              );
            })}
          </RadioGroup>
        ) : null}
        {options.length > RADIO_LIMIT ? (
          <Command className="rounded-md border border-border" aria-label={title}>
            <CommandInput placeholder={t('common.search.placeholder')} className="text-base" />
            <CommandList role="listbox" aria-invalid={reasonError || undefined}>
              <CommandEmpty />
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  data-checked={chosen === option.value}
                  aria-selected={chosen === option.value}
                  onSelect={() => setChosen(option.value)}
                  className="min-h-11 text-base"
                >
                  <DataText>{option.label}</DataText>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        ) : null}
        {reasonError ? (
          <p id={reasonErrorId} className="text-sm text-destructive">
            {t('error.reason_required')}
          </p>
        ) : null}
        {noteShown ? (
          <div className="flex flex-col gap-1">
            <TextInput
              multiline
              value={noteText}
              onChange={setNoteText}
              // No "Note" label in the language files (design D6): the note is named by the reason it
              // explains, or by the title for a free-text reason.
              aria-label={picked?.label ?? title}
              aria-required={noteRequired || undefined}
              aria-invalid={noteError || undefined}
              aria-describedby={noteError ? noteErrorId : undefined}
            />
            {noteError ? (
              <p id={noteErrorId} className="text-sm text-destructive">
                {t('error.reason_required')}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
