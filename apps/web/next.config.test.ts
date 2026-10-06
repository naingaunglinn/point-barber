import { describe, expect, it } from 'vitest';

import nextConfig from './next.config';

// Technical guarantee, no spec scenario (design D17): Claude Code's instructions come only from the
// repository's CLAUDE.md and the coding guideline, never from files `next dev` writes.
describe('apps/web/next.config.ts', () => {
  it('stops next dev from writing AGENTS.md and CLAUDE.md for AI agents', () => {
    expect(nextConfig.agentRules).toBe(false);
  });
});
