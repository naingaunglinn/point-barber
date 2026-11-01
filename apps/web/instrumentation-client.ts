import { z } from 'zod';

// Runs in the browser before any code of the app (Next.js `instrumentation-client`). Zod 4 compiles
// object parsers with `new Function` when it may; its first parse probes that with `Function("")`,
// which the content-security policy blocks (no 'unsafe-eval' — add-staging-deploy design D8) and
// reports as a violation even though Zod then falls back. Jitless mode skips the probe; the parsers
// work the same.
z.config({ jitless: true });
