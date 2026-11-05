'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';

import {
  type CompanyDto,
  ErrorCode,
  HttpStatus,
  type Problem,
  companyUpdateSchema,
} from '@point/shared';
import {
  BilingualInput,
  Button,
  Dialog,
  FormAlert,
  FormField,
  applyProblem,
  fieldErrorOf,
  toast,
  useAppForm,
  useTextField,
} from '@point/ui';

import { ApiProblem } from '../../lib/api/client';
import { screenProblem } from '../../lib/pos/problem';
import { useSaveCompany } from '../../lib/settings/company';
import { CompanyTextField, type CompanyForm as Form } from './CompanyTextField';
import { companyPatch, valuesOf } from './company-values';
import { SocialLinksFields } from './SocialLinksFields';

// Settings › Company — the form (organization spec "The company form sends only the changed members and
// shows each refusal where it belongs" · AD-FORM-01 … 05 / 08 / 09 · AD-LAY-01 / 03 / 04 · AD-RT-02 ·
// AD-TOAST-01 · add-company-profile design D8 · tasks 4.4 – 4.6). Sections Name · Contact · Address ·
// Website and social links, at most 720 px wide, one column below 768 px, the action bar sticky at the
// bottom (above the bottom navigation on a phone). The request schema is the resolver, so most refusals
// of the API show before Save; Save sends the changed members with the `updated_at` the form loaded.
// Answers: 200 → toast and the saved values; 400 → each message under its field, focus on the first;
// 409 `conflict` → the banner with Reload above the form, the typed values kept until Reload; 403 (the
// grants changed meanwhile) → the client's 403 handler loads `/me` again and the screen shows the
// values as text; any other refusal → the inline alert at the top. Back with unsaved edits asks
// "Discard changes?"; so does closing or reloading the tab (the browser's own question).

// Above the bottom navigation below 768 px (its items are `min-h-14`, a 1 px top border and the
// safe-area inset — as the checkout's Finish bar), at the bottom of the window from 768 px.
const ACTION_BAR =
  'sticky bottom-[calc(--spacing(14)+1px+env(safe-area-inset-bottom))] z-10 flex items-center gap-2 border-t border-border bg-background py-3 md:bottom-0 md:justify-end';
const SECTION_HEADING = 'text-lg font-semibold';

export interface CompanyFormProps {
  readonly company: CompanyDto;
  /** Loads the company again (Reload after a conflict); rejects when the load fails. */
  readonly reload: () => Promise<CompanyDto>;
}

export function CompanyForm({ company, reload }: CompanyFormProps) {
  const t = useTranslations('settings.company');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const save = useSaveCompany();
  // The version the inputs started from: the first load, the answer of a save, or Reload — never a
  // background refetch, so a stale edit still reaches the server's 409.
  const [loaded, setLoaded] = useState(company);
  const [conflict, setConflict] = useState(false);
  const [alert, setAlert] = useState<Pick<Problem, 'code' | 'request_id'> | null>(null);
  const [leaving, setLeaving] = useState(false);
  const form: Form = useAppForm(companyUpdateSchema, { defaultValues: valuesOf(company) });
  const { isDirty, isSubmitting } = form.formState;
  const contactId = useId();
  const addressId = useId();

  // Closing or reloading the tab with unsaved edits: the browser asks (AD-FORM-08).
  useEffect(() => {
    if (!isDirty) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [isDirty]);

  const startFrom = (next: CompanyDto) => {
    form.reset(valuesOf(next));
    setLoaded(next);
  };

  const submit = form.handleSubmit(async (parsed) => {
    setAlert(null);
    setConflict(false);
    const body = companyPatch(parsed, form.getValues(), loaded);
    try {
      const answer = await save.mutateAsync(body);
      startFrom(answer);
      toast.success(t('saved'));
    } catch (error) {
      if (!(error instanceof ApiProblem)) {
        setAlert(screenProblem(error));
        return;
      }
      if (error.problem.code === ErrorCode.CONFLICT) {
        setConflict(true);
        return;
      }
      // A 403 names no field; `/me` is being loaded again by the client's 403 handler.
      const rest =
        error.status === HttpStatus.FORBIDDEN ? error.problem : applyProblem(form, error.problem);
      if (rest !== null) setAlert(rest);
    }
  });

  const onReload = async () => {
    try {
      startFrom(await reload());
      setConflict(false);
      setAlert(null);
    } catch (error) {
      setAlert(screenProblem(error));
    }
  };

  return (
    <>
      <form
        noValidate
        className="grid w-full max-w-180 gap-6"
        data-testid="company-form"
        onSubmit={(event) => void submit(event)}
      >
        {conflict ? (
          <div className="grid gap-2" data-testid="company-conflict">
            <FormAlert problem={{ code: ErrorCode.CONFLICT, request_id: '' }} />
            <div>
              <Button data-testid="company-reload" onClick={onReload}>
                {t('reload')}
              </Button>
            </div>
          </div>
        ) : null}
        {alert === null ? null : <FormAlert problem={alert} />}
        <NameField form={form} />
        <section aria-labelledby={contactId} className="grid gap-4">
          <h2 id={contactId} className={SECTION_HEADING}>
            {t('section.contact')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <CompanyTextField form={form} name="phone" label={t('phone')} testId="company-phone" />
            <CompanyTextField
              form={form}
              name="email"
              label={t('email')}
              testId="company-email"
              type="email"
            />
          </div>
        </section>
        <section aria-labelledby={addressId} className="grid gap-4">
          <h2 id={addressId} className={SECTION_HEADING}>
            {t('section.address')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <CompanyTextField
              form={form}
              name="address_mm"
              label={tCommon('bilingual.mm')}
              testId="company-address-mm"
              lang="my"
              multiline
            />
            <CompanyTextField
              form={form}
              name="address_en"
              label={tCommon('bilingual.en')}
              testId="company-address-en"
              lang="en"
              multiline
            />
          </div>
        </section>
        <SocialLinksFields form={form} headingClassName={SECTION_HEADING} />
        <div className={ACTION_BAR} data-testid="company-actions">
          <Button
            variant="ghost"
            icon={<ArrowLeft />}
            data-testid="company-back"
            onClick={() => (isDirty ? setLeaving(true) : router.back())}
          >
            {tCommon('action.goBack')}
          </Button>
          {/* The one primary button: full width on a phone, Back to its left (AD-LAY-04). */}
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            className="flex-1 md:flex-none"
            data-testid="company-save"
          >
            {tCommon('action.save')}
          </Button>
        </div>
      </form>
      <Dialog
        open={leaving}
        onOpenChange={setLeaving}
        role="alertdialog"
        title={tCommon('form.discard.title')}
        footer={
          <>
            <Button data-testid="company-keep-editing" onClick={() => setLeaving(false)}>
              {tCommon('action.keepEditing')}
            </Button>
            <Button
              variant="destructive"
              data-testid="company-discard"
              onClick={() => {
                setLeaving(false);
                router.back();
              }}
            >
              {tCommon('action.discard')}
            </Button>
          </>
        }
      />
    </>
  );
}

/**
 * The Myanmar and English name as one pair (AD-FORM-09 · D-DB-04): Myanmar required, English optional
 * with the hint "Leave English empty to show the Myanmar text"; a message of either member under the pair.
 */
function NameField({ form }: { readonly form: Form }) {
  const t = useTranslations('settings.company');
  const mm = useTextField(form, 'name_mm');
  const en = useTextField(form, 'name_en');
  const { errors } = form.formState;
  return (
    <FormField
      label={t('section.name')}
      required
      error={fieldErrorOf(errors, 'name_mm') ?? fieldErrorOf(errors, 'name_en')}
    >
      {(control) => (
        <BilingualInput
          {...control}
          ref={mm.ref}
          enRef={en.ref}
          testIds={{ mm: 'company-name-mm', en: 'company-name-en' }}
          value={{ mm: mm.value, en: en.value === '' ? null : en.value }}
          onChange={(next) => {
            if (next.mm !== mm.value) mm.onChange(next.mm);
            const nextEn = next.en ?? '';
            if (nextEn !== en.value) en.onChange(nextEn);
          }}
          onBlur={(event) => {
            mm.onBlur(event);
            en.onBlur(event);
          }}
        />
      )}
    </FormField>
  );
}
