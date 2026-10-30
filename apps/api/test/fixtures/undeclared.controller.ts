import { Controller, Get } from '@nestjs/common';

// `GET /v1/_fixtures/undeclared` — an endpoint with no access declaration (access spec "An undeclared
// endpoint is closed even for the admin" · design D11 · task 4.13). It must fail the lint rule
// point/one-access-decorator, so the root ESLint config lists it with the must-fail fixtures and the
// rule's test lints it on its own. Test application only.

export const undeclaredCalls = { count: 0 };

@Controller('v1/_fixtures/undeclared')
export class UndeclaredFixtureController {
  @Get()
  read(): { ok: true } {
    undeclaredCalls.count += 1;
    return { ok: true };
  }
}
