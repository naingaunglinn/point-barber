import { NotImplementedException } from '@nestjs/common';

// add-website-management task 1.6 — the twelve routes of P8.WEB.01 – 12 are declared first, with the
// access decorators of design D2, so their permission rules are reviewed once and pinned by
// website-routes.test.ts. A controller is mounted in PlatformModule by the part that builds its
// handlers (A2 hours · A3 / A4 closures · A5 the reads and the refresh · A6 the content save); until
// then no request reaches a handler and this body is never run.

/** The body of a declared route whose part has not landed. */
export function notBuilt(route: string): never {
  throw new NotImplementedException(`${route} is built by a later part of add-website-management`);
}
