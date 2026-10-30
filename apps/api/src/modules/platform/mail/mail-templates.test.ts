import { describe, expect, it } from 'vitest';

import { MailTemplates } from './mail-templates.js';

// add-foundation-auth-access task 2.11 — AD-L10N-06 · D-PLT-03 · P1.AUTH.01 · design D8: the sign-in
// code e-mail in the user's language, NULL → Myanmar; the code ungrouped on a line of its own, the
// 5-minute validity, no link, no digit in the subject.
const templates = new MailTemplates();
const CODE = '04829173';
const EIGHT_DIGITS = /[0-9]{8}/g;

describe('the sign-in code e-mail (task 2.11)', () => {
  it.each([
    ['en', 'Point Barbershop sign-in code'],
    ['my', 'Point Barbershop ဝင်ရောက်ရန် code'],
  ] as const)('renders %s', (locale, subject) => {
    const mail = templates.render('auth.email.otp', locale, { code: CODE });
    expect(mail.subject).toBe(subject);
    expect(mail.text.split('\n')).toContain(CODE);
    expect(mail.text.match(EIGHT_DIGITS)).toStrictEqual([CODE]);
    expect(mail.html.match(EIGHT_DIGITS)).toStrictEqual([CODE]);
  });

  it('falls back to Myanmar when the user has no language (NULL)', () => {
    expect(templates.render('auth.email.otp', null, { code: CODE })).toStrictEqual(
      templates.render('auth.email.otp', 'my', { code: CODE }),
    );
  });

  it('states the 5-minute validity', () => {
    expect(templates.render('auth.email.otp', 'en', { code: CODE }).text).toMatch(/5 minutes/);
    expect(templates.render('auth.email.otp', 'my', { code: CODE }).text).toMatch(/5 မိနစ်/);
  });

  it.each(['en', 'my'] as const)('has no digit in the subject and no link (%s)', (locale) => {
    const mail = templates.render('auth.email.otp', locale, { code: CODE });
    expect(mail.subject).not.toMatch(/[0-9၀-၉]/);
    expect(`${mail.text}${mail.html}`).not.toMatch(/https?:|<a\s|www\./i);
  });

  it('escapes the parameters in the HTML body', () => {
    expect(templates.render('auth.email.otp', 'en', { code: '<b>1</b>' }).html).toContain(
      '&lt;b&gt;1&lt;/b&gt;',
    );
  });

  it('refuses an unknown template and a missing parameter', () => {
    expect(() => templates.render('auth.email.nope', 'en', {})).toThrow(/unknown mail template/);
    expect(() => templates.render('auth.email.otp', 'en', {})).toThrow(/missing parameter code/);
  });
});
