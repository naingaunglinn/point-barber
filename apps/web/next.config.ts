import type { NextConfig } from 'next';

// One Next.js app serves both hosts; proxy.ts picks the route tree (ADR-001 · design D11).
// `standalone` is what the web image runs (ADR-006).
// `agentRules: false`: `next dev` writes no AGENTS.md / CLAUDE.md into apps/web when it detects an
// AI agent. Claude Code would load those files as instructions; its instructions come only from the
// repository's CLAUDE.md and the coding guideline (design D17).
const nextConfig: NextConfig = {
  output: 'standalone',
  agentRules: false,
};

export default nextConfig;
