// Public surface of the `people` module (CG-ARCH-01 · ADR-001 rule 1): other modules import only
// from here.
export { PeopleDirectory } from './directory/people-directory.js';
export { PeopleModule } from './people.module.js';
