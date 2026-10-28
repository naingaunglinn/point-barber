import { Global, Module } from '@nestjs/common';

import { OrSelfResolvers, TargetResolvers } from './resolvers.js';

// The registries of design D11, one instance for the whole application: modules register their
// loaders and resolvers at start-up; AccessGuard reads them.
@Global()
@Module({
  providers: [TargetResolvers, OrSelfResolvers],
  exports: [TargetResolvers, OrSelfResolvers],
})
export class AccessModule {}
