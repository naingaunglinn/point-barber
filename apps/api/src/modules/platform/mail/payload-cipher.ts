import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// The template parameters of a queued e-mail, encrypted (D-AUTH-04 · add-foundation-auth-access
// design D8): pg-boss keeps job data as readable JSON, and a sign-in code may be stored only as a
// hash — so the job carries `params_enc`, AES-256-GCM under MAIL_PAYLOAD_KEY (32 bytes, base64).
// Format: `v1.<iv>.<tag>.<ciphertext>`, each part base64url; a fresh 12-byte IV per message.

const VERSION = 'v1';

export function encryptParams(params: Readonly<Record<string, string>>, keyBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyBase64, 'base64'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(params), 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), body]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** Throws when the value is malformed or was encrypted under another key. */
export function decryptParams(value: string, keyBase64: string): Record<string, string> {
  const [version, iv, tag, body] = value.split('.');
  if (version !== VERSION || iv === undefined || tag === undefined || body === undefined) {
    throw new Error('not an encrypted mail payload');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyBase64, 'base64'),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const text = Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(text) as Record<string, string>;
}
