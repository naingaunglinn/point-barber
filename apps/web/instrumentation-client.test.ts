import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// add-staging-deploy task 5.2 — the screens run under the policy without a violation (design D8):
// Zod in the browser never probes for eval.
describe('instrumentation-client.ts', () => {
  it('switches Zod to jitless mode', async () => {
    await import('./instrumentation-client');
    expect(z.config().jitless).toBe(true);
  });
});
