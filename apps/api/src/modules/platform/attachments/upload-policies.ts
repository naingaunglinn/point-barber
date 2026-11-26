import { AttachmentKind } from '@point/shared';

import { STAGING_ENTITY } from '../repositories/attachments.repository.js';
import type { AttachmentPolicies, AttachmentPolicy } from './attachment-registries.js';

// The policies this change registers (P8-RULE-03 policy table · design D8): the staging rows of an upload
// (the uploader only — another user's row is hidden, never "forbidden"), the company logo and the employee
// photo (any signed-in staff member reads, and may ask to remove: the live row is always the current file
// of a single-image field, so the remove ends in 409 `attachment_in_use` — spec "Remove is a soft delete…",
// step 3). The policies of the other `(entity_type, kind)` pairs are registered by the change that creates
// those rows.

const OWN_STAGING = (kind: number): AttachmentPolicy => ({
  entity_type: STAGING_ENTITY,
  kind,
  read: (caller, entityId) => (entityId === caller.user_id ? 'allow' : 'hidden'),
  remove: (caller, entityId) => (entityId === caller.user_id ? 'allow' : 'hidden'),
});

/** `companyId`: the one company (D-ORG-03); a company id that is not it is not found. */
export function registerUploadPolicies(
  policies: AttachmentPolicies,
  companyId: () => Promise<string | null>,
): void {
  for (const kind of Object.values(AttachmentKind)) policies.register(OWN_STAGING(kind));
  policies.register({
    entity_type: 'companies',
    kind: AttachmentKind.IMAGE,
    read: async (_caller, entityId) => ((await companyId()) === entityId ? 'allow' : 'hidden'),
    remove: async (_caller, entityId) => ((await companyId()) === entityId ? 'allow' : 'hidden'),
  });
  policies.register({
    entity_type: 'employees',
    kind: AttachmentKind.IMAGE,
    read: () => 'allow',
    remove: () => 'allow',
  });
}
