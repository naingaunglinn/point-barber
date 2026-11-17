import { z } from 'zod';

import { MAILPIT_URL } from '../hosts.js';
import { readJson } from './json.js';

// Reading the code e-mail (ADR-007 · docs/plan/spec-fixtures.md §7 · task 8.1): Mailpit's API is
// searched for the address; the newest message after `since` must hold exactly one 8-digit run — the
// code stands on a line of its own, ungrouped (design D8).

interface Summary {
  readonly ID: string;
  readonly Created: string;
}

async function messagesTo(address: string): Promise<Summary[]> {
  const query = encodeURIComponent(`to:"${address}"`);
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
  if (!res.ok) throw new Error(`Mailpit search answered ${res.status}`);
  return (
    await readJson(
      z.object({ messages: z.array(z.object({ ID: z.string(), Created: z.string() })) }),
      res,
    )
  ).messages;
}

export const mailpit = {
  /** How many messages Mailpit holds for the address. */
  async count(address: string): Promise<number> {
    return (await messagesTo(address)).length;
  },

  /** The code of the newest message for the address created at or after `since`; waits up to 30 s. */
  async readCode(address: string, since: Date): Promise<string> {
    for (let i = 0; i < 60; i += 1) {
      const newest = (await messagesTo(address))
        .filter((message) => Date.parse(message.Created) >= since.getTime() - 1000)
        .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
      if (newest !== undefined) {
        const res = await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`);
        const { Text: text } = await readJson(z.object({ Text: z.string() }), res);
        const codes = text.match(/\b[0-9]{8}\b/g) ?? [];
        if (codes.length !== 1) throw new Error(`expected one 8-digit code, found ${codes.length}`);
        return codes[0] ?? '';
      }
      await new Promise((done) => setTimeout(done, 500));
    }
    throw new Error(`no code e-mail for ${address} since ${since.toISOString()}`);
  },
};
