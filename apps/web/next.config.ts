import type { NextConfig } from 'next';

// One Next.js app serves both hosts; proxy.ts picks the route tree (ADR-001 · design D11).
// `standalone` is what the web image runs (ADR-006).
// `agentRules: false`: `next dev` writes no AGENTS.md / CLAUDE.md into apps/web when it detects an
// AI agent. Claude Code would load those files as instructions; its instructions come only from the
// repository's CLAUDE.md and the coding guideline (design D17).
// `globalNotFound`: each route tree has its own root layout (add-shared-ui-components design D1), so
// the 404 of an unmatched URL is app/global-not-found.tsx. `transpilePackages`: @point/ui ships its
// TypeScript sources.
const nextConfig: NextConfig = {
  output: 'standalone',
  agentRules: false,
  transpilePackages: ['@point/ui'],
  experimental: { globalNotFound: true },
};

export default nextConfig;
