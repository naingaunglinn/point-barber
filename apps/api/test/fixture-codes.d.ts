// The fixture codes of design D11 (`fixture.view`, `fixture.shared_view`, `fixture.private_view`),
// for the fixture controllers only: they are not in permissions.json, and the shipped build
// (tsconfig.build — src only) never sees this widening. helpers/seeded.ts syncs them for the tests.
import '../src/common/access/declarations.js';

declare module '../src/common/access/declarations.js' {
  interface ExtraPermissionCodes {
    'fixture.view': true;
    'fixture.shared_view': true;
    'fixture.private_view': true;
  }
}
