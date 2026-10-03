import type { NextConfig } from 'next';

// One Next.js app serves both hosts; proxy.ts picks the route tree (ADR-001 · design D11).
// `standalone` is what the web image runs (ADR-006).
const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
