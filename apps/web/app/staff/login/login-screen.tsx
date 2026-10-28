'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { isLocale } from '@point/i18n';
import { formatTime, normalizeDigits, otpRequestSchema, type OtpRequest } from '@point/shared';
import {
  Button,
  FormField,
  LanguageSwitch,
  applyProblem,
  fieldErrorOf,
  registerField,
  useAppForm,
  type FieldError,
} from '@point/ui';

import { PUBLIC_API_BASE } from '../../../env';
import { ApiProblem, api } from '../../../lib/api/client';
import { navigation } from '../../../lib/session/navigate';
import type { SignedOutKey } from '../../../lib/session/return-to';

// The staff login screen (auth spec "Login screen offers Google and an e-mail code, nothing else",
// "Code entry screen", "A lost session leads to the login screen …" · AD-LOGIN-01 / 02 · AD-AUTH-01 ·
// AD-FORM-02 / 03 / 04 · AD-FMT-10 · design D17). Two steps in component state: the address, then the
// code. Tests find the controls by test id (CG-TEST-06). The countdown and the lock are timed with
// `performance.now()` from the server's answer — the device's clock is never read (CG-TIME-03).

export const RESEND_SECONDS = 60;

export interface LoginScreenProps {
  /** `?reason=1…4` → the signed-out message. */
  readonly signedOut?: SignedOutKey;
  /** `?error=google_not_linked`. */
  readonly googleNotLinked?: boolean;
  /** The checked `return_to`: where a successful sign-in goes. */
  readonly returnTo?: string;
}

/** A ticking `performance.now()` while `active`; re-renders four times a second. */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** Spaces dropped, Myanmar digits ၀–၉ → 0–9, anything else dropped. */
export const codeDigits = (text: string): string => normalizeDigits(text).replace(/\D/g, '');

/** `48291735` → `4829 1735`. */
export const groupCode = (digits: string): string =>
  digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;

const problemOf = (error: unknown): ApiProblem | undefined =>
  error instanceof ApiProblem ? error : undefined;

export function LoginScreen({ signedOut, googleNotLinked = false, returnTo }: LoginScreenProps) {
  const t = useTranslations('auth');
  const raw = useLocale();
  const locale = isLocale(raw) ? raw : 'my';
  const [sent, setSent] = useState<{ readonly email: string; readonly at: number }>();

  const google = () => {
    const query = returnTo === undefined ? '' : `?return_to=${encodeURIComponent(returnTo)}`;
    navigation.assign(`${PUBLIC_API_BASE}/auth/google/start${query}`);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-4">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-lg font-bold">{t('login.shopName')}</p>
          <h1 className="text-2xl font-bold">{t('login.title')}</h1>
        </div>
        <LanguageSwitch value={locale} />
      </header>

      {signedOut === undefined ? null : (
        <p role="status" data-testid="login-reason" className="rounded-md border border-border p-3">
          {t(`signedOut.${signedOut}`)}
        </p>
      )}
      {googleNotLinked ? (
        <p
          role="alert"
          data-testid="login-google-error"
          className="rounded-md border border-destructive p-3 text-destructive"
        >
          {t('login.googleNotLinked')}
        </p>
      ) : null}

      {sent === undefined ? (
        <>
          <Button data-testid="login-google" variant="secondary" fullWidth onClick={google}>
            {t('login.google')}
          </Button>
          <p className="text-center text-sm text-muted-foreground">{t('login.or')}</p>
          <EmailStep onSent={(email) => setSent({ email, at: performance.now() })} />
        </>
      ) : (
        <CodeStep
          email={sent.email}
          sentAt={sent.at}
          returnTo={returnTo}
          onResent={() => setSent({ email: sent.email, at: performance.now() })}
          onOtherEmail={() => setSent(undefined)}
        />
      )}
    </main>
  );
}

function EmailStep({ onSent }: Readonly<{ onSent: (email: string) => void }>) {
  const t = useTranslations('auth');
  const form = useAppForm(otpRequestSchema, { defaultValues: { email: '' } });
  const submit = form.handleSubmit(async ({ email }: OtpRequest) => {
    try {
      await api('/auth/otp/request', { method: 'POST', body: { email }, signIn: true });
      onSent(email);
    } catch (error) {
      const failure = problemOf(error);
      if (failure?.problem.code === 'rate_limited') {
        form.setError('email', {
          type: 'rate_limited',
          message: JSON.stringify({ retry_after: failure.problem.retry_after ?? 60 }),
        });
      } else if (failure !== undefined) {
        applyProblem(form, failure.problem);
      } else {
        throw error;
      }
    }
  });
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <FormField
        label={t('login.emailLabel')}
        required
        error={fieldErrorOf(form.formState.errors, 'email')}
      >
        {(control) => (
          <input
            {...control}
            {...registerField(form, 'email')}
            data-testid="login-email"
            type="email"
            autoComplete="email"
            className="h-12 rounded-md border border-input bg-background px-3 md:h-10"
          />
        )}
      </FormField>
      <Button
        data-testid="login-send-code"
        type="submit"
        variant="primary"
        fullWidth
        loading={form.formState.isSubmitting}
      >
        {t('login.sendCode')}
      </Button>
    </form>
  );
}

function CodeStep({
  email,
  sentAt,
  returnTo,
  onResent,
  onOtherEmail,
}: Readonly<{
  email: string;
  sentAt: number;
  returnTo: string | undefined;
  onResent: () => void;
  onOtherEmail: () => void;
}>) {
  const t = useTranslations('auth');
  const raw = useLocale();
  const locale = isLocale(raw) ? raw : 'my';
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<FieldError>();
  const [submitting, setSubmitting] = useState(false);
  const [lockEnd, setLockEnd] = useState<number>();
  const now = useTick(true);
  const remaining = Math.max(0, Math.ceil(RESEND_SECONDS - (now - sentAt) / 1000));
  const locked = lockEnd !== undefined && now < lockEnd;

  const check = (value: string): FieldError | undefined => {
    if (value === '') return { code: 'required' };
    return /^[0-9]{8}$/.test(value) ? undefined : { code: 'otp_format' };
  };

  const verify = async () => {
    const invalid = check(digits);
    setError(invalid);
    if (invalid !== undefined || locked) return;
    setSubmitting(true);
    try {
      await api('/auth/otp/verify', {
        method: 'POST',
        body: { email, code: digits },
        signIn: true,
      });
      navigation.assign(returnTo ?? '/');
    } catch (failure) {
      const problem = problemOf(failure);
      if (problem === undefined) throw failure;
      const { code, until, retry_after: retryAfter } = problem.problem;
      if (code === 'login_locked' && until !== undefined) {
        const end = Date.parse(until);
        setLockEnd(performance.now() + Math.max(0, end - (problem.serverTime ?? end)));
        setError({ code, params: { time: formatTime(until, { locale }) } });
      } else if (code === 'rate_limited') {
        setError({ code, params: { retry_after: retryAfter ?? 60 } });
      } else if (code === 'validation') {
        setError({ code: 'otp_format' });
      } else {
        setError({ code });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    try {
      await api('/auth/otp/request', { method: 'POST', body: { email }, signIn: true });
      setError(undefined);
      onResent();
    } catch (failure) {
      const problem = problemOf(failure);
      if (problem?.problem.code === 'rate_limited') {
        setError({
          code: 'rate_limited',
          params: { retry_after: problem.problem.retry_after ?? 60 },
        });
      } else {
        throw failure;
      }
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void verify();
      }}
    >
      <p role="status" data-testid="login-code-sent">
        {t('code.sent')}
      </p>
      <FormField label={t('code.label')} required error={error}>
        {(control) => (
          <input
            {...control}
            data-testid="login-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={groupCode(digits)}
            disabled={locked}
            onChange={(event) => {
              const next = codeDigits(event.target.value);
              setDigits(next);
              if (error !== undefined && error.code !== 'login_locked') setError(check(next));
            }}
            onBlur={() => {
              if (digits !== '') setError((current) => current ?? check(digits));
            }}
            className="h-12 rounded-md border border-input bg-background px-3 font-numeric tracking-widest md:h-10"
          />
        )}
      </FormField>
      <ul className="text-sm text-muted-foreground">
        <li>{t('code.validFor')}</li>
        <li>{t('code.latestOnly')}</li>
      </ul>
      <Button
        data-testid="login-submit"
        type="submit"
        variant="primary"
        fullWidth
        loading={submitting}
        disabled={locked}
      >
        {t('code.submit')}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          data-testid="login-resend"
          variant="ghost"
          disabled={remaining > 0}
          onClick={resend}
        >
          {remaining > 0 ? t('code.resendIn', { seconds: remaining }) : t('code.resend')}
        </Button>
        <Button variant="ghost" onClick={onOtherEmail}>
          {t('code.otherEmail')}
        </Button>
      </div>
    </form>
  );
}
