import {
  Body,
  Controller,
  Get,
  HttpCode,
  type OnModuleInit,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { FIXTURE_IDS } from '@point/shared/testing';

import { AccessContext } from '../../src/common/access/access-context.js';
import { Can, CanView, Internal, Staff } from '../../src/common/access/declarations.js';
import { reaches } from '../../src/common/access/grant-set.js';
import { Public } from '../../src/common/access/public.decorator.js';
import { TargetResolvers, routeKey } from '../../src/common/access/resolvers.js';

// The access fixtures of design D14 (tasks 4.11–4.13): each endpoint carries the declaration a spec
// scenario of `specs/access` names, over rows held here in memory — branch notes, staff cards and
// staff-read rows at the fixture branches. Test application only. The company-action, branch-action
// and branch-items endpoints are in audit.controller.ts, which the audit scenarios share.

const { B1, B2, B3 } = FIXTURE_IDS.branches;
const rowId = (n: number): string => `0199a3f2-0000-7000-8f01-${n.toString(16).padStart(12, '0')}`;

/** 2 notes at B1, 1 at B2, 3 at B3. */
export const BRANCH_NOTES = [
  { id: rowId(1), branch_id: B1 },
  { id: rowId(2), branch_id: B1 },
  { id: rowId(3), branch_id: B2 },
  { id: rowId(4), branch_id: B3 },
  { id: rowId(5), branch_id: B3 },
  { id: rowId(6), branch_id: B3 },
] as const;

/** One card each for Ko Aung (B3), Ko Min (B3) and Ko Htet (B1). */
export const STAFF_CARDS = {
  E004: { id: rowId(0x11), employee_id: FIXTURE_IDS.employees.E004, branch_id: B3 },
  E005: { id: rowId(0x12), employee_id: FIXTURE_IDS.employees.E005, branch_id: B3 },
  E006: { id: rowId(0x13), employee_id: FIXTURE_IDS.employees.E006, branch_id: B1 },
} as const;

/** Operational rows at B1, B2 and B3. */
export const STAFF_ROWS = [
  { id: rowId(0x21), branch_id: B1 },
  { id: rowId(0x22), branch_id: B2 },
  { id: rowId(0x23), branch_id: B3 },
] as const;

/** How often each handler ran: a refused request never reaches it. */
export const accessCalls = {
  archive: 0,
  mixed: 0,
  internal: 0,
};

interface Page<T> {
  readonly items: readonly T[];
  readonly next_cursor: string | null;
}

/** Rows of the scope, narrowed by an optional `branch_id`; outside the scope the page is empty. */
function filtered<T extends { branch_id: string }>(rows: readonly T[], branchId?: string): Page<T> {
  const scope = AccessContext.scope();
  if (branchId !== undefined && !reaches(scope, branchId)) return { items: [], next_cursor: null };
  const items = rows.filter(
    (row) =>
      reaches(scope, row.branch_id) && (branchId === undefined || row.branch_id === branchId),
  );
  return { items, next_cursor: null };
}

@Controller('v1/_fixtures')
export class AccessFixtureController implements OnModuleInit {
  constructor(private readonly targets: TargetResolvers) {}

  onModuleInit(): void {
    const note = (id: string) => {
      const found = BRANCH_NOTES.find((row) => row.id === id);
      return Promise.resolve(found === undefined ? null : { branch_ids: [found.branch_id] });
    };
    this.targets.register(
      [
        routeKey('GET', '/v1/_fixtures/branch-notes/:id'),
        routeKey('POST', '/v1/_fixtures/branch-notes/:id/archive'),
      ],
      note,
    );
    this.targets.register(routeKey('GET', '/v1/_fixtures/staff-cards/:id'), (id) => {
      const card = Object.values(STAFF_CARDS).find((row) => row.id === id);
      return Promise.resolve(
        card === undefined ? null : { branch_ids: [card.branch_id], employee_id: card.employee_id },
      );
    });
  }

  /** "Any code of the module opens the company-master read." */
  @Get('company-read')
  @CanView('role')
  companyRead(): { ok: true } {
    return { ok: true };
  }

  /** "A list is filtered to the caller's branch." */
  @Get('branch-notes')
  @CanView('employee')
  notes(@Query('branch_id') branchId?: string): Page<{ id: string; branch_id: string }> {
    return filtered(BRANCH_NOTES, branchId);
  }

  /** "A single read outside the scope looks like 'not found'." */
  @Get('branch-notes/:id')
  @Can('employee.view', { branch: 'params.id→entity.branch_id' })
  note(@Param('id') id: string): { id: string; branch_id: string } | undefined {
    return BRANCH_NOTES.find((row) => row.id === id);
  }

  /** "The branch is taken from the loaded entity." */
  @Post('branch-notes/:id/archive')
  @HttpCode(200)
  @Can('employee.rating_update', { branch: 'params.id→entity.branch_id' })
  archive(): { ok: true } {
    accessCalls.archive += 1;
    return { ok: true };
  }

  /** "A mixed target is company master when no branch is named and branch data when one is." */
  @Put('mixed-value')
  @Can('settings.update', { branch: 'body.branch_id?' })
  mixed(@Body() body: { value?: number; branch_id?: string }): { value: number | null } {
    accessCalls.mixed += 1;
    return { value: body.value ?? null };
  }

  /** "Shared code at branch scope." */
  @Get('shared-read')
  @Can('fixture.shared_view', { level: 'shared' })
  sharedRead(): { ok: true } {
    return { ok: true };
  }

  /** "Private code at branch scope reaches nothing — not even a list." */
  @Get('private-list')
  @CanView('fixture', { level: 'private' })
  privateList(): Page<{ id: string; branch_id: string }> {
    return filtered(BRANCH_NOTES);
  }

  /** "The subject of a record may reach it without the code." */
  @Get('staff-cards/:id')
  @Can('employee.view', { branch: 'params.id→entity.branch_id', orSelf: 'entity.employee_id' })
  card(@Param('id') id: string): { id: string; employee_id: string } | undefined {
    return Object.values(STAFF_CARDS).find((row) => row.id === id);
  }

  /** "Staff endpoint needs a session but no code" · "An operational read is limited to the read scope." */
  @Get('staff-read')
  @Staff()
  staffRead(@Query('branch_id') branchId?: string): Page<{ id: string; branch_id: string }> {
    return filtered(STAFF_ROWS, branchId);
  }

  /** "Internal endpoint refuses the web container's key." */
  @Post('internal')
  @HttpCode(200)
  @Internal()
  internal(): { ok: true } {
    accessCalls.internal += 1;
    return { ok: true };
  }
}

/** A route of the public website's API: not a staff-app call, so the CSRF guard does not check it. */
@Controller('v1/public/_fixtures')
export class PublicApiFixtureController {
  @Post('ping')
  @HttpCode(200)
  @Public()
  ping(): { ok: true } {
    return { ok: true };
  }
}
