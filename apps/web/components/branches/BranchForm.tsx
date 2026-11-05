'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { z } from 'zod';

import { type Branch, BranchLimits, ErrorCode, type Problem } from '@point/shared';
import {
  BilingualInput,
  Button,
  ChoiceGroup,
  Dialog,
  FormAlert,
  FormField,
  ReadOnlyFields,
  applyProblem,
  fieldErrorOf,
  toast,
  useAppForm,
  useTextField,
} from '@point/ui';

import { ApiProblem } from '../../lib/api/client';
import { type BranchFormValues, PUBLIC } from '../../lib/branches/form-values';
import {
  type BranchBody,
  type BranchForm as Form,
  BranchSection,
  BranchTextField,
} from './BranchFields';
import { SocialLinksEditor } from './SocialLinksEditor';

// The branch form (AD-FORM-01 … 05 · AD-FORM-08 · AD-FORM-09 · AD-RT-02 · add-branch-management spec
// "The branch form creates and edits a branch with messages at the fields" · design D9): three titled
// sections — Branch, Address and location, Website — validated with the API's schema on blur and on
// Save (AD-FORM-03); the server's `errors[]` land under their fields, 409 `already_exists` under *Code*
// as `branch.field.codeTaken`, 409 `conflict` keeps the input and shows the banner with Reload, and any
// other refusal is the inline alert at the top (AD-FORM-04). A saved form shows the toast
// `branch.toast.saved`. Leaving with unsaved edits — Cancel, or closing or reloading the tab — asks
// first (AD-FORM-08). On edit the code is text: it never changes (owner BR1). The action bar sticks to
// the bottom (above the bottom navigation on a phone — AD-LAY-03 / 04), as on Settings › Company.

// Above the bottom navigation below 768 px (its items are `min-h-14`, a 1 px top border and the
// safe-area inset), at the bottom of the window from 768 px — the action bar of Settings › Company.
const ACTION_BAR =
  'sticky bottom-[calc(--spacing(14)+1px+env(safe-area-inset-bottom))] z-10 flex items-center gap-2 border-t border-border bg-background py-3 md:bottom-0 md:justify-end';

export interface BranchFormProps<B extends BranchBody> {
  /** The edited branch; absent on create. */
  readonly branch?: Branch;
  readonly defaultValues: BranchFormValues;
  readonly schema: z.ZodType<B, BranchFormValues>;
  readonly save: (body: B) => Promise<Branch>;
  readonly onSaved: (branch: Branch) => void;
  readonly onCancel: () => void;
  /** Loads the branch again after a 409 `conflict` (AD-RT-02). */
  readonly onReload?: () => void | Promise<unknown>;
  /** Told whether the form holds unsaved edits. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

function BilingualField<B extends BranchBody>({
  form,
  member,
  label,
  required,
  multiline = false,
  maxLength,
}: Readonly<{
  form: Form<B>;
  member: 'name' | 'address';
  label: string;
  required: boolean;
  multiline?: boolean;
  maxLength: number;
}>) {
  const mm = useTextField(form, `${member}_mm`);
  const en = useTextField(form, `${member}_en`);
  const errors = form.formState.errors;
  return (
    <div data-testid={`branch-field-${member}_mm`}>
      {/* The asterisk is the Myanmar input's own (AD-FORM-01 · AD-FORM-09). */}
      <FormField
        label={label}
        error={fieldErrorOf(errors, `${member}_mm`) ?? fieldErrorOf(errors, `${member}_en`)}
      >
        {(control) => (
          <BilingualInput
            {...control}
            required={required}
            multiline={multiline}
            maxLength={maxLength}
            value={{ mm: mm.value, en: en.value === '' ? null : en.value }}
            onChange={(next) => {
              mm.onChange(next.mm);
              en.onChange(next.en ?? '');
            }}
            onBlur={(event) => {
              mm.onBlur(event);
              en.onBlur(event);
            }}
            ref={mm.ref}
            enRef={en.ref}
            testIds={{ mm: `branch-${member}-mm`, en: `branch-${member}-en` }}
          />
        )}
      </FormField>
    </div>
  );
}

function PublicField<B extends BranchBody>({ form }: Readonly<{ form: Form<B> }>) {
  const t = useTranslations('branch');
  const field = useTextField(form, 'is_public');
  return (
    <div data-testid="branch-field-is_public">
      <ChoiceGroup
        label={t('field.isPublic')}
        options={[
          { value: PUBLIC.SHOWN, label: t('list.shown'), testId: 'branch-public-shown' },
          { value: PUBLIC.HIDDEN, label: t('list.hidden'), testId: 'branch-public-hidden' },
        ]}
        value={field.value === PUBLIC.HIDDEN ? PUBLIC.HIDDEN : PUBLIC.SHOWN}
        onChange={field.onChange}
      />
    </div>
  );
}

/** The banner of a stale save (AD-RT-02): the input stays, Reload shows the stored branch. */
function ConflictBanner({ onReload }: Readonly<{ onReload: () => void | Promise<unknown> }>) {
  const t = useTranslations('branch.form');
  return (
    <div
      role="alert"
      data-testid="branch-conflict-banner"
      className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-warning-subtle p-3"
    >
      <TriangleAlert aria-hidden className="size-5 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-sm">{t('conflict')}</p>
      <Button onClick={onReload} data-testid="branch-reload">
        {t('reload')}
      </Button>
    </div>
  );
}

/** A refusal as the form shows it; a request that got no answer is `unknown` (the offline banner says why). */
type Refusal = Pick<Problem, 'code' | 'request_id'>;
const NO_ANSWER: Refusal = { code: 'unknown', request_id: '' };

export function BranchForm<B extends BranchBody>({
  branch,
  defaultValues,
  schema,
  save,
  onSaved,
  onCancel,
  onReload,
  onDirtyChange,
}: BranchFormProps<B>) {
  const t = useTranslations();
  const form = useAppForm<BranchFormValues, B>(schema, { defaultValues });
  const [alert, setAlert] = useState<Refusal | null>(null);
  const [conflict, setConflict] = useState(false);
  const [asking, setAsking] = useState(false);
  const dirty = form.formState.isDirty;

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // Closing or reloading the tab with unsaved edits asks the browser's own question (AD-FORM-08).
  useEffect(() => {
    if (!dirty) return undefined;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [dirty]);

  const submit = form.handleSubmit(async (body) => {
    setAlert(null);
    setConflict(false);
    try {
      const saved = await save(body);
      toast.success(t('branch.toast.saved'));
      onSaved(saved);
    } catch (error) {
      if (!(error instanceof ApiProblem)) {
        setAlert(NO_ANSWER);
        return;
      }
      const { problem } = error;
      if (problem.code === ErrorCode.ALREADY_EXISTS) {
        form.setError(
          'code',
          { type: ErrorCode.ALREADY_EXISTS, message: '{}' },
          { shouldFocus: true },
        );
      } else if (problem.code === ErrorCode.CONFLICT) {
        setConflict(true);
      } else {
        setAlert(applyProblem(form, problem));
      }
    }
  });

  const codeMessage = (code: string) =>
    code === ErrorCode.ALREADY_EXISTS ? t('branch.field.codeTaken') : undefined;

  return (
    <form
      noValidate
      className="grid gap-8"
      data-testid="branch-form"
      onSubmit={(event) => void submit(event)}
    >
      {conflict && onReload !== undefined ? <ConflictBanner onReload={onReload} /> : null}
      {alert === null ? null : <FormAlert problem={alert} />}

      <BranchSection title={t('branch.form.section.branch')}>
        {branch === undefined ? (
          <BranchTextField
            form={form}
            name="code"
            label={t('branch.field.code')}
            required
            helper={t('branch.field.codeHelp')}
            maxLength={BranchLimits.CODE_MAX}
            message={codeMessage}
          />
        ) : (
          <BranchCode code={branch.code} />
        )}
        <BilingualField
          form={form}
          member="name"
          label={t('branch.field.name')}
          required
          maxLength={BranchLimits.NAME_MAX}
        />
        <BranchTextField
          form={form}
          name="phone"
          label={t('branch.field.phone')}
          inputMode="tel"
          maxLength={BranchLimits.PHONE_MAX}
        />
        <BranchTextField
          form={form}
          name="email"
          label={t('branch.field.email')}
          type="email"
          inputMode="email"
          maxLength={BranchLimits.EMAIL_MAX}
        />
      </BranchSection>

      <BranchSection title={t('branch.form.section.location')}>
        <BilingualField
          form={form}
          member="address"
          label={t('branch.field.address')}
          required={false}
          multiline
          maxLength={BranchLimits.ADDRESS_MAX}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <BranchTextField
            form={form}
            name="latitude"
            label={t('branch.field.latitude')}
            inputMode="decimal"
          />
          <BranchTextField
            form={form}
            name="longitude"
            label={t('branch.field.longitude')}
            inputMode="decimal"
          />
        </div>
        <BranchTextField
          form={form}
          name="location_radius_meters"
          label={t('branch.field.radius')}
          helper={t('branch.field.radiusHelp')}
          inputMode="numeric"
        />
        <BranchTextField
          form={form}
          name="map_url"
          label={t('branch.field.mapUrl')}
          helper={t('branch.field.mapUrlHelp')}
          inputMode="url"
          maxLength={BranchLimits.LINK_MAX}
        />
      </BranchSection>

      <BranchSection title={t('branch.form.section.website')}>
        <PublicField form={form} />
        <BranchTextField
          form={form}
          name="website_url"
          label={t('branch.field.websiteUrl')}
          inputMode="url"
          maxLength={BranchLimits.LINK_MAX}
        />
        <SocialLinksEditor form={form} />
      </BranchSection>

      <div className={ACTION_BAR}>
        <Button onClick={() => (dirty ? setAsking(true) : onCancel())} data-testid="branch-cancel">
          {t('common.action.cancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={form.formState.isSubmitting}
          data-testid="branch-save"
        >
          {t('common.action.save')}
        </Button>
      </div>

      <Dialog
        open={asking}
        onOpenChange={setAsking}
        role="alertdialog"
        title={t('common.form.discard.title')}
        footer={
          <>
            <Button onClick={() => setAsking(false)}>{t('common.action.keepEditing')}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setAsking(false);
                onCancel();
              }}
            >
              {t('common.action.discard')}
            </Button>
          </>
        }
      />
    </form>
  );
}

/** The code of a saved branch, as text (owner BR1 — it never changes). */
export function BranchCode({ code }: Readonly<{ code: string }>) {
  const t = useTranslations('branch.field');
  return (
    <div data-testid="branch-field-code">
      <ReadOnlyFields fields={[{ label: t('code'), value: code }]} />
    </div>
  );
}
