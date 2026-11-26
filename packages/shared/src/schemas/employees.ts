import { z } from 'zod';

import { ErrorCode, FieldIssueCode } from '../constants/error-codes.js';
import {
  EmployeeStatus,
  LoginMethod,
  ScopeType,
  UiLanguage,
  UserStatus,
} from '../constants/status.js';
import { normalizeDigits } from '../text/digits.js';
import { branchAssignmentSchema, branchSummarySchema } from './branches.js';
import { catalogueCode } from './catalogue-code.js';
import { listQuerySchema } from './list-query.js';
import { codeOf, wireDate, wireDateTime } from './wire.js';

// add-employee-management — P1.EMP.01 – 05 · 07 · 08 · 12 · 16 (API Part 1 v1.8 · owner EM2 · design
// D4 / D6). Request bodies are plain z.object, so an unknown member (`email` or `status` on an update)
// is stripped (CG-API-03). They hold no default or transform, so absent and null stay apart and the
// OpenAPI document reads them as they are; normalizeEmployeeMembers() runs after parsing.

/** Employee limits: DB Part 1 v3.4 columns, OpenAPI Part 1 `EmployeeCreate`, owner EM2. */
export const EmployeeLimits = {
  EMAIL_MAX: 255,
  CODE_MAX: 100,
  NAME_MAX: 255,
  PHONE_MAX: 50,
  /** owner EM2 (★ A, add-employee-management proposal): no locked source bounds it; CG-API-03 needs one. */
  NOTES_MAX: 1000,
  SPECIALTY_MAX: 200,
  REASON_MAX: 500,
  QUERY_MAX: 100,
  /** owner EM2 (★ A): `branch_ids` ≤ 20 and `role_assignments` ≤ 10 — no locked source gives them. */
  BRANCH_IDS_MAX: 20,
  ROLE_ASSIGNMENTS_MAX: 10,
  RATING_MIN: 1,
  RATING_MAX: 5,
  RATING_STEP: 0.5,
} as const;

/** The members that are `null` or a trimmed text of at most `max` characters. */
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** 1 – 100 characters after trimming (`employees.employee_code varchar(100)`, NOT NULL). */
export const employeeCodeSchema = z.string().trim().min(1).max(EmployeeLimits.CODE_MAX);

/** Trimmed, an address (`email_invalid`, never `invalid_format`), at most 255 (`too_big`). */
export const employeeEmailSchema = z
  .string()
  .trim()
  .max(EmployeeLimits.EMAIL_MAX, { abort: true })
  .check(z.email(catalogueCode(ErrorCode.EMAIL_INVALID)));

/** The Myanmar name is required and never null (D-DB-04). */
const nameMm = z.string().trim().min(1).max(EmployeeLimits.NAME_MAX);

/** 1.0 – 5.0 in steps of 0.5 (P1.EMP.12 · DB `employees_public_rating_chk`). */
export const publicRatingValueSchema = z
  .number()
  .min(EmployeeLimits.RATING_MIN)
  .max(EmployeeLimits.RATING_MAX)
  .multipleOf(EmployeeLimits.RATING_STEP);

/** The members the profile groups of P1.EMP.04 share between the create and the update. */
const profileMembers = {
  name_en: optionalText(EmployeeLimits.NAME_MAX),
  phone: optionalText(EmployeeLimits.PHONE_MAX),
  join_date: wireDate.nullable().optional(),
  internal_notes: optionalText(EmployeeLimits.NOTES_MAX),
};

const branchIds = z.array(z.uuid()).max(EmployeeLimits.BRANCH_IDS_MAX);

/** One `role_assignments` item of the create (EM3): the role, the scope and, for scope 2, branches. */
export const roleAssignmentInputSchema = z.object({
  role_id: z.uuid(),
  scope_type: z.literal([ScopeType.COMPANY, ScopeType.BRANCHES]),
  branch_ids: branchIds.optional(),
});

/** P1.EMP.02 body — OpenAPI `EmployeeCreate` (v1.8). */
export const employeeCreateSchema = z.object({
  email: employeeEmailSchema,
  employee_code: employeeCodeSchema.nullable().optional(),
  name_mm: nameMm,
  ...profileMembers,
  branch_ids: branchIds.optional(),
  role_assignments: z
    .array(roleAssignmentInputSchema)
    .max(EmployeeLimits.ROLE_ASSIGNMENTS_MAX)
    .optional(),
  send_invite: z.boolean().optional(),
});

/**
 * P1.EMP.04 body — OpenAPI `EmployeeUpdate` (v1.8): every member optional (API-SHAPE-04); no `email`
 * or `status`, so a sent one is stripped; `name_mm`, `employee_code` and `public_profile` are never
 * null (`invalid_type`); an empty body is valid and changes nothing (D4).
 */
export const employeeUpdateSchema = z.object({
  employee_code: employeeCodeSchema.optional(),
  name_mm: nameMm.optional(),
  ...profileMembers,
  photo_attachment_id: z.uuid().nullable().optional(),
  public_profile: z.boolean().optional(),
  public_specialty_mm: optionalText(EmployeeLimits.SPECIALTY_MAX),
  public_specialty_en: optionalText(EmployeeLimits.SPECIALTY_MAX),
  public_rating: publicRatingValueSchema.nullable().optional(),
  show_own_earnings: z.boolean().nullable().optional(),
  expected_updated_at: wireDateTime.optional(),
});

/** P1.EMP.05 body — 0 INACTIVE · 1 ACTIVE · 2 RESIGNED · 3 TERMINATED; the reason goes to the audit row. */
export const employeeStatusSchema = z.object({
  status: codeOf(EmployeeStatus),
  effective_date: wireDate.optional(),
  reason: z.string().trim().max(EmployeeLimits.REASON_MAX).optional(),
});

/** P1.EMP.07 body — the branch and the first day (default today, MMT). */
export const branchAssignSchema = z.object({
  branch_id: z.uuid(),
  effective_from: wireDate.optional(),
});

/** P1.EMP.08 body — the last day of the assignment. */
export const branchEndSchema = z.object({ effective_to: wireDate });

/** P1.EMP.12 body — `public_rating` is required; `null` takes the rating off the website. */
export const publicRatingSchema = z.object({ public_rating: publicRatingValueSchema.nullable() });

/** P1.EMP.16 body — the optional reason (audit only); the body itself may be absent. */
export const revokeAllSchema = z.object({
  reason: z.string().trim().max(EmployeeLimits.REASON_MAX).optional(),
});

export type EmployeeCreateBody = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateBody = z.infer<typeof employeeUpdateSchema>;
export type EmployeeStatusBody = z.infer<typeof employeeStatusSchema>;
export type BranchAssignBody = z.infer<typeof branchAssignSchema>;
export type BranchEndBody = z.infer<typeof branchEndSchema>;
export type PublicRatingBody = z.infer<typeof publicRatingSchema>;
export type RevokeAllBody = z.infer<typeof revokeAllSchema>;

/** The profile members of a create or update as they are stored; absent stays absent. */
export interface EmployeeMembers {
  readonly name_mm?: string;
  readonly name_en?: string | null;
  readonly phone?: string | null;
  readonly join_date?: string | null;
  readonly internal_notes?: string | null;
  readonly public_specialty_mm?: string | null;
  readonly public_specialty_en?: string | null;
}

const blankToNull = (value: string | null): string | null => (value === '' ? null : value);

/**
 * The text members of a parsed create or update body as they are stored (design D4): an optional text
 * empty after trimming → null, the phone with Myanmar digits written 0–9 (AD-FMT-10); an absent member
 * stays absent and `null` stays `null`.
 */
export function normalizeEmployeeMembers(
  body: EmployeeCreateBody | EmployeeUpdateBody,
): EmployeeMembers {
  const { name_mm, name_en, phone, join_date, internal_notes } = body;
  const specialtyMm = 'public_specialty_mm' in body ? body.public_specialty_mm : undefined;
  const specialtyEn = 'public_specialty_en' in body ? body.public_specialty_en : undefined;
  return {
    ...(name_mm === undefined ? {} : { name_mm }),
    ...(name_en === undefined ? {} : { name_en: blankToNull(name_en) }),
    ...(phone === undefined
      ? {}
      : { phone: phone === null ? null : blankToNull(normalizeDigits(phone)) }),
    ...(join_date === undefined ? {} : { join_date }),
    ...(internal_notes === undefined ? {} : { internal_notes: blankToNull(internal_notes) }),
    ...(specialtyMm === undefined ? {} : { public_specialty_mm: blankToNull(specialtyMm) }),
    ...(specialtyEn === undefined ? {} : { public_specialty_en: blankToNull(specialtyEn) }),
  };
}

/** P1.EMP.01 `sort` (API-DATA-08). */
export const EMPLOYEE_SORTS = [
  'name_mm',
  '-name_mm',
  'employee_code',
  '-employee_code',
  'join_date',
  '-join_date',
  'created_at',
  '-created_at',
] as const;
export type EmployeeSort = (typeof EMPLOYEE_SORTS)[number];

/** A code of a named set written as text in a query string; any other text is `invalid_value`. */
function codesFromText(set: Record<string, number>) {
  const allowed = Object.values(set);
  return (texts: readonly string[], ctx: z.RefinementCtx, input: unknown): number[] => {
    const codes: number[] = [];
    for (const text of texts) {
      const code = allowed.find((value) => String(value) === text);
      if (code === undefined) {
        ctx.issues.push({ code: FieldIssueCode.INVALID_VALUE, values: allowed, input });
        return [];
      }
      if (!codes.includes(code)) codes.push(code);
    }
    return codes;
  };
}

const statusCodes = codesFromText(EmployeeStatus);
const loginStatusCodes = codesFromText(UserStatus);

/** `status` once (`status=1`) or repeated (`status=1&status=2`); no default — absent means every status. */
const statusFilter = z
  .union([z.string(), z.array(z.string())])
  .transform((value, ctx) => statusCodes(typeof value === 'string' ? [value] : value, ctx, value));

/** `login_status` 0 DISABLED · 1 ACTIVE · 2 INVITED (`users.status`). */
const loginStatusFilter = z.string().transform((value, ctx) => {
  const [code] = loginStatusCodes([value], ctx, value);
  return code;
});

/** P1.EMP.01 query (D8): the search text, the filters, the sort, `cursor` and `limit` 1 – 100 (default 25). */
export const employeeListQuerySchema = listQuerySchema.extend({
  q: z.string().trim().max(EmployeeLimits.QUERY_MAX).optional(),
  branch_id: z.uuid().optional(),
  role_id: z.uuid().optional(),
  status: statusFilter.optional(),
  login_status: loginStatusFilter.optional(),
  sort: z.enum(EMPLOYEE_SORTS).default('name_mm'),
});

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

// Responses — OpenAPI Part 1 `EmployeeRef` / `EmployeeListItem` / `Employee` / `UserAccess` /
// `RoleAssignment` / `Session` / `Warning` (design D6). Strict objects: a member that is not listed
// here never reaches the wire.

const uiLanguage = z.literal([UiLanguage.MY, UiLanguage.EN]);

/** The members of Part 1 `EmployeeRef` every employee answer starts with. */
const employeeRefMembers = {
  id: z.uuid(),
  employee_code: z.string(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  photo_url: z.string().nullable(),
};

/** OpenAPI Part 1 `UserAccess` — the login of an employee (P1.EMP.03). */
export const userAccessSchema = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  status: codeOf(UserStatus),
  ui_language: uiLanguage.nullable(),
  invited_at: wireDateTime.nullable(),
  invite_last_sent_at: wireDateTime.nullable(),
  activated_at: wireDateTime.nullable(),
  last_login_at: wireDateTime.nullable(),
  login_locked_until: wireDateTime.nullable(),
});

/** OpenAPI Part 1 `RoleAssignment` — read-only data of `employee_roles` (D6). */
export const roleAssignmentSchema = z.strictObject({
  id: z.uuid(),
  role: z.strictObject({ id: z.uuid(), name_mm: z.string(), name_en: z.string().nullable() }),
  scope_type: z.literal([ScopeType.COMPANY, ScopeType.BRANCHES]),
  branch_ids: z.array(z.uuid()),
  assigned_at: wireDateTime,
  revoked_at: wireDateTime.nullable(),
});

/** OpenAPI Part 1 `EmployeeListItem` — one row of P1.EMP.01. */
export const employeeListItemSchema = z.strictObject({
  ...employeeRefMembers,
  phone: z.string().nullable(),
  status: codeOf(EmployeeStatus),
  login_status: codeOf(UserStatus),
  branches: z.array(branchSummarySchema),
  roles: z.array(
    z.strictObject({ id: z.uuid(), name_mm: z.string(), name_en: z.string().nullable() }),
  ),
  join_date: wireDate.nullable(),
});

/** The members the self view leaves out (P1.EMP.03 · API-PERM-04 · D6). */
export const EMPLOYEE_SELF_VIEW_OMITTED = ['internal_notes', 'show_own_earnings'] as const;

/** OpenAPI Part 1 `Employee` — P1.EMP.02 – 05; `internal_notes` and `show_own_earnings` are absent on the self view. */
export const employeeSchema = z.strictObject({
  ...employeeRefMembers,
  phone: z.string().nullable(),
  join_date: wireDate.nullable(),
  status: codeOf(EmployeeStatus),
  internal_notes: z.string().nullable().optional(),
  public_profile: z.boolean(),
  public_specialty_mm: z.string().max(EmployeeLimits.SPECIALTY_MAX).nullable(),
  public_specialty_en: z.string().max(EmployeeLimits.SPECIALTY_MAX).nullable(),
  public_rating: publicRatingValueSchema.nullable(),
  show_own_earnings: z.boolean().nullable().optional(),
  effective_show_own_earnings: z.boolean(),
  user: userAccessSchema,
  branches: z.array(branchAssignmentSchema),
  roles: z.array(roleAssignmentSchema),
  sessions_count: z.int().min(0).optional(),
  created_at: wireDateTime,
  updated_at: wireDateTime,
});

/** The self view: `Employee` without the two members of EMPLOYEE_SELF_VIEW_OMITTED. */
export const employeeSelfViewSchema = employeeSchema.omit({
  internal_notes: true,
  show_own_earnings: true,
});

/** OpenAPI Part 1 `Session` — one device of P1.ME.03 / P1.EMP.15. */
export const sessionSchema = z.strictObject({
  id: z.uuid(),
  device_label: z.string().nullable(),
  login_method: codeOf(LoginMethod),
  ip_address: z.string().nullable(),
  created_at: wireDateTime,
  last_seen_at: wireDateTime,
  is_current: z.boolean(),
});

export type EmployeeListItem = z.infer<typeof employeeListItemSchema>;
export type EmployeeDto = z.infer<typeof employeeSchema>;
export type EmployeeSelfViewDto = z.infer<typeof employeeSelfViewSchema>;
export type UserAccessDto = z.infer<typeof userAccessSchema>;
export type RoleAssignmentDto = z.infer<typeof roleAssignmentSchema>;
export type SessionDto = z.infer<typeof sessionSchema>;

/**
 * The one mapper of an employee answer (design D6): it lists every member of `Employee` explicitly, so a
 * member added to `source` (a new column) never reaches the wire. The self view (`self: true`) leaves
 * out EMPLOYEE_SELF_VIEW_OMITTED. The result is checked against the strict schema.
 */
export function toEmployeeView(
  source: EmployeeDto,
  options: { readonly self?: boolean } = {},
): EmployeeDto {
  const view: EmployeeDto = {
    id: source.id,
    employee_code: source.employee_code,
    name_mm: source.name_mm,
    name_en: source.name_en,
    photo_url: source.photo_url,
    phone: source.phone,
    join_date: source.join_date,
    status: source.status,
    public_profile: source.public_profile,
    public_specialty_mm: source.public_specialty_mm,
    public_specialty_en: source.public_specialty_en,
    public_rating: source.public_rating,
    effective_show_own_earnings: source.effective_show_own_earnings,
    user: source.user,
    branches: source.branches,
    roles: source.roles,
    created_at: source.created_at,
    updated_at: source.updated_at,
    ...(source.sessions_count === undefined ? {} : { sessions_count: source.sessions_count }),
    ...(options.self === true
      ? {}
      : {
          ...(source.internal_notes === undefined ? {} : { internal_notes: source.internal_notes }),
          ...(source.show_own_earnings === undefined
            ? {}
            : { show_own_earnings: source.show_own_earnings }),
        }),
  };
  return employeeSchema.parse(view);
}
