'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';

import { errorMessageKey } from '@point/shared';

import { InputGroup, InputGroupAddon, InputGroupInput } from '../../primitives/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '../../primitives/popover';
import { RadioGroup, RadioGroupItem } from '../../primitives/radio-group';
import { DataText } from '../DataText/DataText';
import { FieldMessage } from '../FormField/FieldMessage';
import type { FieldError } from '../FormField/FormField';

// One choice among options (AD-FORM-14 · AD-A11Y-04 · AD-A11Y-05 · AD-VIS-07 · D-UI-01 · design D10): up
// to 7 options a radio group with every option visible, 8 or more a collapsed searchable combobox
// (AD-FORM-14 "More → searchable combobox"). Not the segmented control (AD-CMP-03) nor the big choice
// buttons (AD-CMP-02). Named by a visible label in the FormField label style, or by `aria-label` where a
// visible title already names it (a dialog). Each option, its label text included, is a 44 px row 8 px
// from the next; option text goes through DataText. The radio form is one tab stop with arrow keys (Radix
// roving focus). The combobox form is a trigger that shows the chosen option; pressing it (or Enter, Space,
// ArrowDown) opens a popover — at every width, as DateInput's picker — with the search field and the
// options, which exist only while it is open. The list is its own listbox on the search field
// (`aria-activedescendant`), not cmdk: cmdk registers every item in a store and costs about six times a
// plain row to mount and to unmount, and the late-entry START sheet opens lists of 288 times. Choosing or
// Esc closes it and the focus returns to the trigger. `required` adds the asterisk; `error` puts the
// message of `error.<code>` under the options and links it with `aria-describedby`. An option's `testId`
// lands on the element with its role, so a test can `check()` it; the group's `data-testid` lands on the
// combobox's trigger, which a test presses, else on the wrapper.

export interface ChoiceOption<V extends string = string> {
  readonly value: V;
  /** Translated text, or a data value (a master name) — shown through DataText. */
  readonly label: string;
  /** Set on the `radio` / `option` element, for the screen's tests. */
  readonly testId?: string;
}

interface ChoiceGroupBase<V extends string> {
  readonly options: readonly ChoiceOption<V>[];
  readonly value: V | null;
  readonly onChange: (value: V) => void;
  readonly required?: boolean;
  readonly error?: FieldError;
  /** Set on the combobox's trigger (8 or more options), else on the group's wrapper. */
  readonly 'data-testid'?: string;
}

/** Exactly one name: a visible `label`, or an `aria-label` when a visible title already names the group. */
export type ChoiceGroupProps<V extends string = string> = ChoiceGroupBase<V> &
  (
    | { readonly label: string; readonly 'aria-label'?: never }
    | { readonly 'aria-label': string; readonly label?: never }
  );

/** How a part of the group is named: by the visible label's id, or by the `aria-label`. */
type GroupName =
  | { readonly 'aria-labelledby': string; readonly 'aria-label'?: undefined }
  | { readonly 'aria-label': string | undefined; readonly 'aria-labelledby'?: undefined };

/** AD-FORM-14: ≤ 7 options are a radio group; more are a searchable combobox. */
export const RADIO_LIMIT = 7;

const REQUIRED_MARK = '*';

/**
 * The options a combobox renders when it opens; a longer list renders the rest right after (a timeout),
 * or at once when the highlight moves past them or the chosen option is further down. The late-entry
 * time list has 288 options and opens fast.
 */
export const FIRST_ROWS = 40;

/**
 * The combobox keeps the options whose label contains the typed text (case-insensitive) — not a fuzzy
 * score, which would also keep "Customer wants to change" for `Other`.
 */
const matches = (label: string, search: string) =>
  label.toLowerCase().includes(search.trim().toLowerCase());

export function ChoiceGroup<V extends string = string>(props: ChoiceGroupProps<V>) {
  const { options, value, onChange, required = false, error, 'data-testid': testId } = props;
  const t = useTranslations();
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;
  const visibleLabel = props.label;
  const hiddenName = props['aria-label'];
  const named: GroupName =
    visibleLabel === undefined ? { 'aria-label': hiddenName } : { 'aria-labelledby': labelId };
  const state = {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
    'aria-required': required || undefined,
  } as const;
  const choose = (next: string) => {
    const option = options.find((candidate) => candidate.value === next);
    if (option !== undefined) onChange(option.value);
  };
  const radio = options.length <= RADIO_LIMIT;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-slot="choice-group"
      data-testid={radio ? testId : undefined}
    >
      {visibleLabel === undefined ? null : (
        <span id={labelId} className="text-sm font-semibold">
          <span>{visibleLabel}</span>
          {required ? (
            <span data-slot="required-mark" aria-hidden className="ms-1 text-destructive">
              {REQUIRED_MARK}
            </span>
          ) : null}
        </span>
      )}
      {radio ? (
        <RadioGroup
          value={value ?? ''}
          onValueChange={choose}
          {...named}
          {...state}
          // 44 px rows 8 px apart (AD-A11Y-05 · AD-VIS-07).
          className="flex flex-col gap-2"
        >
          {options.map((option) => {
            const optionId = `${id}-${option.value}`;
            return (
              <label
                key={option.value}
                htmlFor={optionId}
                className="flex min-h-11 items-center gap-3 rounded-md px-1 hover:bg-muted"
              >
                <RadioGroupItem id={optionId} value={option.value} data-testid={option.testId} />
                <DataText>{option.label}</DataText>
              </label>
            );
          })}
        </RadioGroup>
      ) : (
        <ChoiceCombobox
          options={options}
          value={value}
          onChange={onChange}
          named={named}
          state={state}
          search={t('common.search.placeholder')}
          testId={testId}
        />
      )}
      {error ? (
        <FieldMessage id={errorId}>{t(errorMessageKey(error.code), error.params)}</FieldMessage>
      ) : null}
    </div>
  );
}

interface ChoiceComboboxProps<V extends string> {
  readonly options: readonly ChoiceOption<V>[];
  readonly value: V | null;
  readonly onChange: (value: V) => void;
  /** The trigger, the popover and the list carry the group's name. */
  readonly named: GroupName;
  readonly state: {
    readonly 'aria-invalid': true | undefined;
    readonly 'aria-describedby': string | undefined;
    readonly 'aria-required': true | undefined;
  };
  /** `common.search.placeholder`, translated. */
  readonly search: string;
  readonly testId: string | undefined;
}

/**
 * The combobox form: the trigger in the field style (48 px, 40 px from 768 px with the 44 px hit area of
 * Button) and a modal popover as wide as the trigger. Modal, because a dialog or sheet below locks the
 * scrolling outside itself, which would swallow the wheel and touch scrolling of the portaled list; Esc
 * then closes only the popover, and closing returns the focus to the trigger (Radix).
 */
function ChoiceCombobox<V extends string>({
  options,
  value,
  onChange,
  named,
  state,
  search,
  testId,
}: ChoiceComboboxProps<V>) {
  const [open, setOpen] = useState(false);
  const popupId = useId();
  const chosen = options.find((option) => option.value === value);
  // Enter and Space are the button's own click; ArrowDown opens the list as on a native select.
  const openWithArrow = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' || open) return;
    event.preventDefault();
    setOpen(true);
  };

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popupId : undefined}
          {...named}
          {...state}
          onKeyDown={openWithArrow}
          data-slot="choice-trigger"
          data-testid={testId}
          className="relative flex min-h-12 w-full min-w-0 items-center gap-2 rounded-lg border border-[var(--field-border)] bg-transparent px-3 py-1 text-start text-base after:absolute after:content-[''] aria-invalid:border-destructive aria-invalid:outline-2 aria-invalid:outline-destructive md:min-h-10 md:after:inset-x-0 md:after:-inset-y-0.5"
        >
          <span className="min-w-0 flex-1">
            {chosen === undefined ? null : <DataText>{chosen.label}</DataText>}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        id={popupId}
        align="start"
        {...named}
        data-slot="choice-popover"
        className="w-(--radix-popover-trigger-width) min-w-64 gap-1 p-1"
      >
        <ChoiceList
          options={options}
          value={value}
          named={named}
          search={search}
          listId={`${popupId}-list`}
          onChoose={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

interface ChoiceListProps<V extends string> {
  readonly options: readonly ChoiceOption<V>[];
  readonly value: V | null;
  readonly named: GroupName;
  readonly search: string;
  readonly listId: string;
  readonly onChoose: (value: V) => void;
}

/**
 * The search field and the options, mounted only while the popover is open. The field keeps the focus and
 * points at the highlighted option (`aria-activedescendant`): first the chosen option, else the first one;
 * after typing, the first match. ArrowDown / ArrowUp move the highlight (stopping at the ends), Enter or a
 * press chooses. Rows are plain buttons with no hooks, 44 px high and 8 px apart (AD-A11Y-05 · AD-VIS-07).
 */
function ChoiceList<V extends string>({
  options,
  value,
  named,
  search,
  listId,
  onChoose,
}: ChoiceListProps<V>) {
  const [text, setText] = useState('');
  const [active, setActive] = useState<V | null>(() => value ?? options[0]?.value ?? null);
  const [all, setAll] = useState(
    () =>
      options.length <= FIRST_ROWS ||
      options.findIndex((option) => option.value === value) >= FIRST_ROWS,
  );
  const list = useRef<HTMLDivElement>(null);
  // An option's id comes from its place among all the options, so it stays the same while filtering.
  const rows = options
    .map((option, index) => ({ option, id: `${listId}-${index}` }))
    .filter(({ option }) => text.trim() === '' || matches(option.label, text));
  const shown = all ? rows : rows.slice(0, FIRST_ROWS);
  const at = rows.findIndex(({ option }) => option.value === active);

  useEffect(() => {
    if (all) return undefined;
    const rest = setTimeout(() => setAll(true), 0);
    return () => clearTimeout(rest);
  }, [all]);

  // Keep the highlighted row in view by scrolling the list only (never the page under the popover).
  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!box || !row) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }, [active]);

  const type = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setText(next);
    const first = options.find((option) => next.trim() === '' || matches(option.label, next));
    setActive(first?.value ?? null);
  };
  const move = (event: KeyboardEvent<HTMLInputElement>) => {
    // A Myanmar keyboard composes with these keys; the composition owns them.
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next =
        event.key === 'ArrowDown' ? Math.min(at + 1, rows.length - 1) : Math.max(at - 1, 0);
      const row = rows[next];
      if (row === undefined) return;
      if (next >= shown.length) setAll(true);
      setActive(row.option.value);
    } else if (event.key === 'Enter') {
      // Never the submit of a form around the group.
      event.preventDefault();
      const row = rows[at];
      if (row !== undefined) onChoose(row.option.value);
    }
  };

  return (
    <>
      <InputGroup className="h-12 md:h-10">
        <InputGroupInput
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={rows[at]?.id}
          aria-label={search}
          placeholder={search}
          autoComplete="off"
          value={text}
          onChange={type}
          onKeyDown={move}
          className="h-full text-base"
        />
        <InputGroupAddon>
          <Search aria-hidden className="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
      <div
        ref={list}
        id={listId}
        role="listbox"
        {...named}
        data-slot="choice-list"
        className="relative flex max-h-72 flex-col gap-2 overflow-y-auto overscroll-contain p-1"
      >
        {shown.map(({ option, id }) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              id={id}
              tabIndex={-1}
              aria-selected={option.value === active}
              data-checked={checked}
              data-testid={option.testId}
              onClick={() => onChoose(option.value)}
              // Two elements per row (the text and, when chosen, the check): 288 rows stay cheap.
              className="flex min-h-11 w-full shrink-0 items-center gap-2 rounded-sm px-2 text-start text-base hover:bg-muted aria-selected:bg-muted [&>span]:min-w-0"
            >
              <DataText>{option.label}</DataText>
              {checked ? <Check aria-hidden className="ms-auto size-4 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </>
  );
}
