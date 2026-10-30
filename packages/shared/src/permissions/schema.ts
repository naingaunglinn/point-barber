import { z } from 'zod';

// One entry of definitions/permissions.json (D-ROLE-08 · ADR-011 · ADR-012): `<module>.<action>`,
// CRUD actions plus named special actions, never `manage`; the screen label is the language key
// `permission.<code>`. Column limits = table `permissions` (code 200, module / action 100).
export const permissionKindSchema = z.enum(['crud', 'special']);
export const permissionLevelSchema = z.enum(['company', 'branch', 'mixed', 'shared', 'private']);

export const permissionEntrySchema = z
  .strictObject({
    code: z
      .string()
      .max(200)
      .regex(/^[a-z][a-z_]*\.[a-z][a-z_]*$/),
    module: z.string().min(1).max(100),
    action: z
      .string()
      .min(1)
      .max(100)
      .refine((action) => action !== 'manage', 'no manage code (ADR-011)'),
    kind: permissionKindSchema,
    level: permissionLevelSchema,
    label_key: z.string(),
    description: z.string().min(1),
  })
  .refine((entry) => entry.code === `${entry.module}.${entry.action}`, {
    message: 'code = <module>.<action>',
  })
  .refine((entry) => entry.label_key === `permission.${entry.code}`, {
    message: 'label_key = permission.<code>',
  });

export const permissionCatalogueSchema = z
  .array(permissionEntrySchema)
  .refine((entries) => new Set(entries.map((entry) => entry.code)).size === entries.length, {
    message: 'a code is declared once',
  });

export type PermissionKind = z.infer<typeof permissionKindSchema>;
export type PermissionLevel = z.infer<typeof permissionLevelSchema>;
export type PermissionEntry = z.infer<typeof permissionEntrySchema>;
