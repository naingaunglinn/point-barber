import { Injectable } from '@nestjs/common';
import authEn from '@point/i18n/messages/en/auth.json' with { type: 'json' };
import authMy from '@point/i18n/messages/my/auth.json' with { type: 'json' };
import type { Locale } from '@point/shared';

// The e-mail templates (AD-L10N-06 · D-PLT-03 · add-foundation-auth-access design D8): subject and
// body from the language files of packages/i18n (texts = the brief's copy table, owner answer S18),
// in the recipient's language; no language (users.ui_language NULL) → Myanmar, the system default.
// Plain text plus a minimal HTML body; parameters are escaped in the HTML.
export interface RenderedMail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

interface Template {
  readonly subject: string;
  readonly body: string;
}

const TEMPLATES: Readonly<Record<string, Readonly<Record<Locale, Template>>>> = {
  'auth.email.otp': { en: authEn.email.otp, my: authMy.email.otp },
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `{name}` → the parameter; a placeholder without a value is a programming error. */
function fill(text: string, params: Readonly<Record<string, string>>): string {
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`mail template: missing parameter ${name}`);
    return value;
  });
}

@Injectable()
export class MailTemplates {
  render(
    template: string,
    locale: Locale | null,
    params: Readonly<Record<string, string>>,
  ): RenderedMail {
    const texts = TEMPLATES[template]?.[locale ?? 'my'];
    if (texts === undefined) throw new Error(`unknown mail template ${template}`);
    const escaped = Object.fromEntries(
      Object.entries(params).map(([name, value]) => [name, escapeHtml(value)]),
    );
    return {
      subject: fill(texts.subject, params),
      text: fill(texts.body, params),
      html: escapeHtml(texts.body)
        .split('\n')
        .map((line) => `<p>${fill(line, escaped)}</p>`)
        .join(''),
    };
  }
}
