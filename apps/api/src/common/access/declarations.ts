import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '@point/shared';

import { ACCESS_METADATA } from './public.decorator.js';

// The access declarations of API-PERM-02 (add-foundation-auth-access design D11). Every handler
// carries exactly one — `point/one-access-decorator` fails the lint otherwise, and AccessGuard
// refuses a route without one at run time. The guard reads the declaration; decide() rules on it.

/**
 * Codes beyond permissions.json that a declaration may name. Empty in the shipped build; the
 * integration tests widen it for their fixture codes (apps/api/test/fixture-codes.d.ts — design D11).
 */
export interface ExtraPermissionCodes {}

export type AccessCode = PermissionCode | (keyof ExtraPermissionCodes & string);

type ModuleOf<C> = C extends `${infer M}.${string}` ? M : never;

/** The module of a code: `employee.view` → `employee`. */
export type AccessModule = ModuleOf<AccessCode>;

/**
 * Where the target branch comes from: `body.<field>`, `query.<field>`, `params.<field>`, a list
 * `body.<list>[].<field>`, or the loaded entity `params.<id>→entity.<field>`. A trailing `?` makes
 * it optional: an empty value is then a company-master target (D11 row 5).
 */
export type BranchPath = string;

/** `employee:<param>` — the P1-RULE-11 target set of the employee in that route parameter. */
export type EmployeeTarget = `employee:${string}`;

/** A path whose value is compared with the caller's employee id or user id, or a resolver name. */
export type OrSelf = string;

export type ScopeError = 'forbidden' | 'out_of_scope';

export type CanOptions =
  | { readonly level: 'company' | 'shared' | 'private' }
  | {
      readonly branch: BranchPath;
      readonly empty?: 'private';
      readonly orSelf?: OrSelf;
      readonly scopeError?: ScopeError;
    }
  | { readonly target: EmployeeTarget; readonly orSelf?: OrSelf; readonly scopeError?: ScopeError };

export interface CanViewOptions {
  readonly level?: 'shared' | 'private';
  readonly branch?: BranchPath;
  readonly target?: EmployeeTarget;
  readonly orSelf?: OrSelf;
}

export interface CanDeclaration {
  readonly kind: 'can';
  readonly code: AccessCode;
  readonly level?: 'company' | 'shared' | 'private';
  readonly branch?: BranchPath;
  readonly target?: EmployeeTarget;
  readonly empty?: 'private';
  readonly orSelf?: OrSelf;
  readonly scopeError?: ScopeError;
}

export interface CanViewDeclaration {
  readonly kind: 'canView';
  readonly module: AccessModule;
  readonly level?: 'shared' | 'private';
  readonly branch?: BranchPath;
  readonly target?: EmployeeTarget;
  readonly orSelf?: OrSelf;
}

export type AccessDeclaration =
  | { readonly kind: 'public' }
  | { readonly kind: 'internal' }
  | { readonly kind: 'staff' }
  | { readonly kind: 'self' }
  | CanDeclaration
  | CanViewDeclaration;

type AccessDecorator = MethodDecorator & ClassDecorator;

const declare = (declaration: AccessDeclaration): AccessDecorator =>
  SetMetadata(ACCESS_METADATA, declaration);

/** A valid session and the grant of `code` for the target the options name (D11). */
export const Can = (code: AccessCode, options: CanOptions): AccessDecorator =>
  declare({ kind: 'can', code, ...options });

/** A management read: any code of `module` at any scope; a list receives the scope to filter by. */
export const CanView = (module: AccessModule, options: CanViewOptions = {}): AccessDecorator =>
  declare({ kind: 'canView', module, ...options });

/** A valid session and no code; the handler limits the data to the caller's read scope. */
export const Staff = (): AccessDecorator => declare({ kind: 'staff' });

/** A valid session and no code; the handler acts only on the caller's own record. */
export const Self = (): AccessDecorator => declare({ kind: 'self' });

/** Operator calls: `X-Internal-Key` must equal INTERNAL_OPS_KEY; no session (ADR-009). */
export const Internal = (): AccessDecorator => declare({ kind: 'internal' });
