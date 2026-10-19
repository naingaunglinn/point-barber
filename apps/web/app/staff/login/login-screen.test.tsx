// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { json, problem, renderStaff } from '../../../test/render';

// add-foundation-auth-access tasks 7.5–7.7 and 7.12 — auth spec "Login screen offers Google and an
// e-mail code, nothing else", "Code entry screen" and the signed-out messages of "A lost session leads
// to the login screen with the reason and back to the same page" (AD-LOGIN-01 / 02 · AD-AUTH-01 ·
// AD-FMT-10 · design D17).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}));
const assign = vi.hoisted(() => vi.fn<(url: string) => void>());
vi.mock('../../../lib/session/navigate', () => ({ navigation: { assign } }));

const { LoginScreen } = await import('./login-screen');

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  assign.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const byTestId = (id: string) => screen.getByTestId(id);
const bodyOf = (call: number) =>
  JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body ?? '{}')) as Record<string, unknown>;

async function toCodeStep(email = 'aung@point.test') {
  fetchMock.mockResolvedValueOnce(json(202, { resend_after_seconds: 60 }));
  fireEvent.change(byTestId('login-email'), { target: { value: email } });
  fireEvent.click(byTestId('login-send-code'));
  await screen.findByTestId('login-code');
}

describe('add-foundation-auth-access · auth · Login screen offers Google and an e-mail code, nothing else', () => {
  it('Scenario: What the screen contains', () => {
    const { container } = renderStaff(<LoginScreen />);
    expect(byTestId('login-google').textContent).toBe('Continue with Google');
    expect(byTestId('login-email')).toBeDefined();
    expect(byTestId('login-send-code').textContent).toBe('Email me a sign-in code');
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByRole('group')).toBeDefined(); // the MM / EN switch
  });

  it('shows the Myanmar texts, and the test ids stay', () => {
    renderStaff(<LoginScreen />, { locale: 'my' });
    expect(byTestId('login-google').textContent).toBe('Google ဖြင့် ဆက်လုပ်မည်');
    expect(byTestId('login-send-code')).toBeDefined();
    expect(byTestId('login-email')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Continue with Google opens the start of the Google flow with the page to come back to', () => {
    renderStaff(<LoginScreen returnTo="/?branch=B3" />);
    fireEvent.click(byTestId('login-google'));
    expect(assign).toHaveBeenCalledWith('/api/v1/auth/google/start?return_to=%2F%3Fbranch%3DB3');
  });

  it('an address that is not an e-mail is stopped on the screen', async () => {
    renderStaff(<LoginScreen />);
    fireEvent.change(byTestId('login-email'), { target: { value: 'aung' } });
    fireEvent.click(byTestId('login-send-code'));
    expect(await screen.findByText('Enter a valid email address.')).toBeDefined();
    expect(byTestId('login-email').getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a 429 is shown under the field with the seconds', async () => {
    renderStaff(<LoginScreen />);
    fetchMock.mockResolvedValueOnce(json(429, problem(429, 'rate_limited', { retry_after: 42 })));
    fireEvent.change(byTestId('login-email'), { target: { value: 'aung@point.test' } });
    fireEvent.click(byTestId('login-send-code'));
    expect(await screen.findByText('Please wait 42 seconds and try again.')).toBeDefined();
  });
});

describe('add-foundation-auth-access · auth · Code entry screen', () => {
  it('Scenario: Same message for a known and an unknown address', async () => {
    for (const email of ['aung@point.test', 'nobody@point.test']) {
      renderStaff(<LoginScreen />);
      await toCodeStep(email);
      expect(byTestId('login-code-sent').textContent).toBe(
        "If this email can sign in, we've sent a code",
      );
      expect(bodyOf(fetchMock.mock.calls.length - 1)).toStrictEqual({ email });
      cleanup();
    }
  });

  it('shows the input for one-time codes and the two fixed texts', async () => {
    renderStaff(<LoginScreen />);
    await toCodeStep();
    const input = byTestId('login-code');
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(screen.getByText('Valid for 5 minutes')).toBeDefined();
    expect(screen.getByText('Only the latest code works')).toBeDefined();
  });

  it('Scenario: Pasted code with a space', async () => {
    renderStaff(<LoginScreen returnTo="/?branch=B3" />);
    await toCodeStep();
    fireEvent.change(byTestId('login-code'), { target: { value: '4829 1735' } });
    expect((byTestId('login-code') as HTMLInputElement).value).toBe('4829 1735');
    fetchMock.mockResolvedValueOnce(json(200, {}));
    fireEvent.click(byTestId('login-submit'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/?branch=B3'));
    expect(bodyOf(1)).toStrictEqual({ email: 'aung@point.test', code: '48291735' });
  });

  it('Scenario: Myanmar digits are converted', async () => {
    renderStaff(<LoginScreen />);
    await toCodeStep();
    fireEvent.change(byTestId('login-code'), { target: { value: '၄၈၂၉၁၇၃၅' } });
    expect((byTestId('login-code') as HTMLInputElement).value).toBe('4829 1735');
    fetchMock.mockResolvedValueOnce(json(200, {}));
    fireEvent.click(byTestId('login-submit'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(bodyOf(1)).toMatchObject({ code: '48291735' });
  });

  it('Scenario: Seven digits are stopped on the screen', async () => {
    renderStaff(<LoginScreen />);
    await toCodeStep();
    fireEvent.change(byTestId('login-code'), { target: { value: '4829 173' } });
    fireEvent.click(byTestId('login-submit'));
    expect(await screen.findByText('Enter the 8-digit code.')).toBeDefined();
    expect(byTestId('login-code').getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the code request
  });

  it('a wrong code shows otp_invalid under the field', async () => {
    renderStaff(<LoginScreen />);
    await toCodeStep();
    fetchMock.mockResolvedValueOnce(json(401, problem(401, 'otp_invalid')));
    fireEvent.change(byTestId('login-code'), { target: { value: '11112222' } });
    fireEvent.click(byTestId('login-submit'));
    expect(await screen.findByText('That code is not right or has expired.')).toBeDefined();
    expect(assign).not.toHaveBeenCalled();
  });

  it('Scenario: Lock message shows the time — the input is disabled until the lock ends', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    renderStaff(<LoginScreen />);
    await toCodeStep();
    fetchMock.mockResolvedValueOnce(
      json(401, problem(401, 'login_locked', { until: '2026-10-05T09:34:00+06:30' }), {
        // The server's answer at 9:14 AM: the lock ends 20 minutes later.
        Date: 'Mon, 05 Oct 2026 02:44:00 GMT',
      }),
    );
    fireEvent.change(byTestId('login-code'), { target: { value: '11112222' } });
    fireEvent.click(byTestId('login-submit'));
    expect(await screen.findByText('Too many attempts. Try again at 9:34 AM.')).toBeDefined();
    expect((byTestId('login-code') as HTMLInputElement).disabled).toBe(true);
    expect((byTestId('login-submit') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000 - 1000);
    });
    expect((byTestId('login-code') as HTMLInputElement).disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect((byTestId('login-code') as HTMLInputElement).disabled).toBe(false);
  });

  it('Scenario: Resend countdown — disabled from 60, enabled after 60 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    renderStaff(<LoginScreen />);
    await toCodeStep();
    const resend = () => byTestId('login-resend') as HTMLButtonElement;
    expect(resend().disabled).toBe(true);
    expect(resend().textContent).toBe('Resend in 60 s');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(resend().textContent).toBe('Resend in 1 s');
    expect(resend().disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(resend().disabled).toBe(false);
    expect(resend().textContent).toBe('Resend');
  });
});

describe('add-foundation-auth-access · auth · A lost session leads to the login screen with the reason …', () => {
  it.each([
    ['LOGOUT', 'You signed out'],
    ['DEVICE_REMOVED', 'This device was removed'],
    ['ADMIN_REVOKE_ALL', 'An admin signed you out of all devices'],
    ['ACCOUNT_INACTIVE', 'Your account is no longer active'],
  ] as const)('shows the message of %s', (key, text) => {
    renderStaff(<LoginScreen signedOut={key} />);
    expect(byTestId('login-reason').textContent).toBe(text);
  });

  it('Scenario: Opening the app signed out — no reason message', () => {
    renderStaff(<LoginScreen returnTo="/?branch=B3" />);
    expect(screen.queryByTestId('login-reason')).toBeNull();
  });

  it('Scenario: Google account not accepted — the message, and both options stay', () => {
    renderStaff(<LoginScreen googleNotLinked />);
    expect(byTestId('login-google-error').textContent).toContain(
      "We couldn't sign you in with this Google account.",
    );
    expect(byTestId('login-google')).toBeDefined();
    expect(byTestId('login-send-code')).toBeDefined();
  });
});
