import { describe, expect, it } from 'vitest';

import { deviceLabel } from './device-label.js';

// add-foundation-auth-access task 5.8 — the session's device label (API-AUD-02 · design D6).

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const WINDOWS_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('device label (task 5.8)', () => {
  it('is <platform> · <browser> from the User-Agent', () => {
    expect(deviceLabel(undefined, ANDROID_CHROME, 'web')).toBe('Android · Chrome');
    expect(deviceLabel(undefined, WINDOWS_EDGE, undefined)).toBe('Windows · Edge');
    expect(deviceLabel(undefined, IPHONE_SAFARI, undefined)).toBe('iOS · Safari');
  });

  it('keeps a shell in the label', () => {
    expect(deviceLabel(undefined, ANDROID_CHROME, 'android-shell')).toBe(
      'Android · Chrome · android-shell',
    );
  });

  it('prefers the label the body sent', () => {
    expect(deviceLabel('Front desk tablet', ANDROID_CHROME, 'web')).toBe('Front desk tablet');
    expect(deviceLabel('  ', ANDROID_CHROME, 'web')).toBe('Android · Chrome');
  });

  it('is null when nothing is known', () => {
    expect(deviceLabel(undefined, undefined, undefined)).toBeNull();
    expect(deviceLabel(undefined, 'curl/8.0', undefined)).toBeNull();
  });
});
