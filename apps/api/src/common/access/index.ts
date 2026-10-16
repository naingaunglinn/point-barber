// The access surface (design D1 `common/access`): declarations, the guard, the pure decision, the
// grant types, the registries and the port the people module implements.
export { AccessContext } from './access-context.js';
export { AccessGuard } from './access.guard.js';
export { AccessModule } from './access.module.js';
export { type Decision, type Target, decide } from './decide.js';
export {
  type AccessCode,
  type AccessDeclaration,
  type AccessModule as AccessModuleName,
  Can,
  CanView,
  type ExtraPermissionCodes,
  Internal,
  Self,
  Staff,
} from './declarations.js';
export {
  type AssignmentRow,
  type BranchAssignmentRow,
  GrantSet,
  GrantSource,
  type GrantSourceRows,
  type MergedGrant,
  type Scope,
  reaches,
} from './grant-set.js';
export { ACCESS_METADATA, Public } from './public.decorator.js';
export {
  type Caller,
  EMPLOYEE_TARGET,
  type LoadedTarget,
  type OrSelfResolver,
  OrSelfResolvers,
  type TargetLoader,
  TargetResolvers,
  routeKey,
} from './resolvers.js';
