import { SetMetadata } from '@nestjs/common';

// Access decorators (API-PERM-02 · CG-API-02 · design D10). Every handler carries exactly one —
// `point/one-access-decorator` fails the lint otherwise. @Public() is here; @Can, @CanView, @Staff,
// @Self and @Internal are in declarations.ts (add-foundation-auth-access D11).
export const ACCESS_METADATA = 'point:access';

/** No session needed (P1.AUTH.*, health, status, the public website's API). */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_METADATA, { kind: 'public' });
