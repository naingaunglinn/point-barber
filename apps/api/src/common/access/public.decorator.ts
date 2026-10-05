import { SetMetadata } from '@nestjs/common';

// Access decorators (API-PERM-02 · CG-API-02 · design D10). Every handler carries exactly one —
// `point/one-access-decorator` fails the build otherwise. Only @Public() exists in this change;
// add-foundation-auth-access adds @Can, @CanView, @Staff, @Self, @Internal and the session guard
// that reads this metadata.
export const ACCESS_METADATA = 'point:access';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_METADATA, { kind: 'public' });
