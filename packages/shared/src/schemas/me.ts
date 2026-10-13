import { z } from 'zod';

import { EmployeeStatus, ScopeType, UiLanguage, UserStatus } from '../constants/status.js';
import { branchSummarySchema } from './branches.js';

// P1.ME.02 `PATCH /v1/me` — the caller's interface language: 1 MY · 2 EN · null = the system
// default (D-PLT-03). A request schema, so unknown members are stripped (CG-API-03).
export const patchMeSchema = z.object({
  ui_language: z.union([z.literal(UiLanguage.MY), z.literal(UiLanguage.EN), z.null()]).optional(),
});

const uiLanguage = z.literal([UiLanguage.MY, UiLanguage.EN]);
const dateTime = z.iso.datetime({ offset: true });

/** OpenAPI Part 1 `Grant` — one permission code with its scope, merged per code (design D13). */
export const grantSchema = z.strictObject({
  code: z.string(),
  scope_type: z.literal([ScopeType.COMPANY, ScopeType.BRANCHES]),
  branch_ids: z.array(z.uuid()),
});

/** OpenAPI Part 1 `MeResponse` — the bootstrap of P1.ME.01, also returned by sign-in (§12). */
export const meResponseSchema = z.strictObject({
  user: z.strictObject({
    id: z.uuid(),
    email: z.email(),
    status: z.literal([UserStatus.ACTIVE, UserStatus.INVITED]),
    ui_language: uiLanguage.nullable(),
    last_login_at: dateTime.nullable(),
  }),
  // EmployeeRef + status: only an ACTIVE employee has a session (P1-RULE-04).
  employee: z.strictObject({
    id: z.uuid(),
    employee_code: z.string(),
    name_mm: z.string(),
    name_en: z.string().nullable(),
    photo_url: z.string().nullable(),
    status: z.literal([EmployeeStatus.ACTIVE]),
  }),
  grants: z.array(grantSchema),
  branches_in_scope: z.array(branchSummarySchema),
  today_branch_id: z.uuid().nullable(),
  assigned_branch_ids: z.array(z.uuid()),
  effective: z.strictObject({ show_own_earnings: z.boolean() }),
  settings: z.record(z.string(), z.unknown()),
  system: z.strictObject({
    maintenance: z.boolean(),
    server_time: dateTime,
    default_language: uiLanguage,
  }),
  session: z.strictObject({
    id: z.uuid(),
    device_label: z.string().nullable(),
    created_at: dateTime,
  }),
});

export type PatchMe = z.infer<typeof patchMeSchema>;
export type Grant = z.infer<typeof grantSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
