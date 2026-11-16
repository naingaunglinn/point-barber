import {
  branchAssignmentSchema,
  branchCreateSchema,
  branchInUseContextSchema,
  branchSchema,
  branchStatusSchema,
  branchSummarySchema,
  branchUpdateSchema,
  commissionEstimateSchema,
  companySchema,
  companyUpdateSchema,
  customerLookupSchema,
  discountRequestSchema,
  durationRangeSchema,
  grantSchema,
  healthSchema,
  maintenanceBodySchema,
  meResponseSchema,
  paymentMethodSchema,
  paymentSchema,
  problemSchema,
  quoteItemSchema,
  quoteSchema,
  receiptLineSchema,
  receiptViewSchema,
  refundSummarySchema,
  requestLookupSchema,
  saleActionsSchema,
  saleAdjustmentSchema,
  saleDiscountSchema,
  saleItemSchema,
  saleSchema,
  serviceCategorySchema,
  SETTING_KEY_PATTERN,
  serviceListItemSchema,
  settingDefinitionSchema,
  settingHistoryItemSchema,
  settingPutBodySchema,
  settingResetBodySchema,
  settingViewSchema,
  socialLinksSchema,
  systemStatusSchema,
  upcomingBookingSchema,
  visitSchema,
  warningSchema,
} from '@point/shared';
import { z } from 'zod';

// The OpenAPI document, generated from the Zod schemas of packages/shared (API-ERR-03 · design D5).
// Paths are relative to `servers[0].url`, as openapi/part1-foundation.yaml writes them. Written to
// dist/openapi.json by `pnpm --filter api openapi`; no documentation endpoint is served. The full
// contract comparison with point-sdd (`openapi:check`) belongs to add-ci-guard-rails.

type JsonSchema = Record<string, unknown>;

const schema = (zodSchema: z.ZodType, io: 'input' | 'output' = 'output'): JsonSchema => {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(zodSchema, {
    io,
    // Zod writes a number literal as `number`; the smallint codes are `integer` in Part 1 (D-DB-03).
    override: ({ zodSchema: source, jsonSchema }) => {
      const def = source._zod.def;
      if (def.type === 'literal' && def.values.every((value) => Number.isInteger(value)))
        jsonSchema.type = 'integer';
    },
  });
  return rest;
};

const PROBLEM_RESPONSE = {
  description: 'Problem details (RFC 9457)',
  content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
};

const json = (name: string) => ({
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
});
const ID_PARAMETER = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

// add-branch-management task 3.12 — P1.BR.02 – 05 as Part 1 v1.7 writes them (owner BR1 – BR3).
const BRANCH_PATHS = {
  '/branches': {
    post: {
      tags: ['branches'],
      operationId: 'createBranch',
      summary: 'Create a branch — branch.create (P1.BR.02)',
      'x-permission': 'branch.create (company master: company scope)',
      requestBody: { required: true, ...json('BranchCreate') },
      responses: {
        '201': {
          description: 'Created',
          headers: { Location: { schema: { type: 'string' } } },
          ...json('Branch'),
        },
        default: PROBLEM_RESPONSE,
      },
    },
  },
  '/branches/{id}': {
    parameters: [ID_PARAMETER],
    get: {
      tags: ['branches'],
      operationId: 'getBranch',
      summary: 'Branch detail (P1.BR.03)',
      'x-permission': 'any staff',
      responses: { '200': { description: 'OK', ...json('Branch') }, default: PROBLEM_RESPONSE },
    },
    patch: {
      tags: ['branches'],
      operationId: 'patchBranch',
      summary: 'Update a branch — branch.update (P1.BR.04)',
      'x-permission': 'branch.update (branch data: branch in scope)',
      requestBody: { required: true, ...json('BranchUpdate') },
      responses: {
        '200': { description: 'Updated', ...json('Branch') },
        default: PROBLEM_RESPONSE,
      },
    },
  },
  '/branches/{id}/status': {
    parameters: [ID_PARAMETER],
    post: {
      tags: ['branches'],
      operationId: 'setBranchStatus',
      summary: 'Activate / deactivate — branch.delete (P1.BR.05)',
      'x-permission': 'branch.delete (company master: company scope)',
      requestBody: { required: true, ...json('BranchStatusRequest') },
      responses: {
        '200': { description: 'Updated', ...json('Branch') },
        '409': {
          description:
            'branch_in_use { open_bookings, open_sales, active_assignments } (v1.7 — owner BR2); the context is BranchInUseContext',
          content: {
            'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } },
          },
        },
        default: PROBLEM_RESPONSE,
      },
    },
  },
};

/** Part 1 `components.parameters.XRequestedWith` — the CSRF header of every changing request. */
const X_REQUESTED_WITH = {
  name: 'X-Requested-With',
  in: 'header',
  required: true,
  schema: { type: 'string', enum: ['point-app'] },
  description: 'CSRF guard for cookie-authenticated mutations (API-AUTH-02)',
};

// add-settings-store task 3.12 — the settings reads P1.SET.01 / 02 / 05 as Part 1 v1.7 writes them.
const settingsOk = (schema: JsonSchema) => ({
  description: 'OK',
  content: { 'application/json': { schema } },
});
const SETTING_KEY_PARAMETER = {
  name: 'key',
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: SETTING_KEY_PATTERN.source },
};
const SETTINGS_BRANCH_PARAMETER = {
  name: 'branch_id',
  in: 'query',
  schema: { type: 'string', format: 'uuid' },
};
const SETTINGS_PATHS = {
  '/settings': {
    get: {
      tags: ['settings'],
      operationId: 'listSettings',
      summary:
        'All setting definitions with company / branch / effective values — settings.view+ (P1.SET.01)',
      'x-permission':
        "settings.view+ (mixed: company values at any scope; branch_id must be covered by the caller's settings grant, else empty items)",
      parameters: [
        { name: 'module', in: 'query', schema: { type: 'string' } },
        SETTINGS_BRANCH_PARAMETER,
      ],
      responses: {
        '200': settingsOk({
          type: 'object',
          required: ['items'],
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/SettingView' } },
          },
        }),
        default: PROBLEM_RESPONSE,
      },
    },
  },
  '/settings/effective': {
    get: {
      tags: ['settings'],
      operationId: 'getEffectiveSettings',
      summary: 'Effective values of client-readable keys (P1.SET.02)',
      'x-permission': 'any staff',
      parameters: [
        SETTINGS_BRANCH_PARAMETER,
        {
          name: 'keys',
          in: 'query',
          schema: { type: 'array', items: { type: 'string' } },
          style: 'form',
          explode: false,
        },
      ],
      responses: {
        '200': settingsOk({
          type: 'object',
          required: ['values', 'as_of'],
          properties: {
            values: { type: 'object', additionalProperties: true },
            as_of: { type: 'string', format: 'date-time' },
          },
        }),
        default: PROBLEM_RESPONSE,
      },
    },
  },
  // P1.SET.03 / 04 — the request bodies are the input side of their schemas.
  '/settings/{key}': {
    parameters: [SETTING_KEY_PARAMETER],
    put: {
      tags: ['settings'],
      operationId: 'putSetting',
      summary: 'Set a company value or a branch override — settings.update (P1.SET.03)',
      'x-permission':
        'settings.update (mixed: no branch_id = company value -> company scope; branch_id = branch override -> that branch in scope)',
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/SettingPutRequest' } },
        },
      },
      responses: {
        '200': {
          description: 'Saved (history row written by trigger; settings.changed emitted)',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SettingView' } } },
        },
        default: PROBLEM_RESPONSE,
      },
    },
  },
  '/settings/{key}/reset': {
    parameters: [SETTING_KEY_PARAMETER],
    post: {
      tags: ['settings'],
      operationId: 'resetSetting',
      summary:
        'Reset to the company value (branch) or to the default (company) — settings.update (P1.SET.04)',
      'x-permission': 'settings.update (mixed — as putSetting)',
      requestBody: {
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/SettingResetRequest' } },
        },
      },
      responses: {
        '200': {
          description: 'Reset',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SettingView' } } },
        },
        default: PROBLEM_RESPONSE,
      },
    },
  },
  '/settings/{key}/history': {
    get: {
      tags: ['settings'],
      operationId: 'getSettingHistory',
      summary: 'Who changed it, when, old → new — settings.view+ (P1.SET.05)',
      'x-permission':
        'settings.view+ (mixed: company rows at any scope; branch rows for covered branches)',
      parameters: [
        SETTING_KEY_PARAMETER,
        SETTINGS_BRANCH_PARAMETER,
        { name: 'cursor', in: 'query', schema: { type: 'string' } },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        },
      ],
      responses: {
        '200': settingsOk({
          type: 'object',
          required: ['items', 'next_cursor'],
          properties: {
            items: { type: 'array', items: { $ref: '#/components/schemas/SettingHistoryItem' } },
            next_cursor: { type: ['string', 'null'] },
          },
        }),
        default: PROBLEM_RESPONSE,
      },
    },
  },
  // P1.SYS.03 — the request body is the input side of maintenanceBodySchema (trimmed, empty → null).
  '/system/maintenance': {
    put: {
      tags: ['system'],
      operationId: 'setMaintenance',
      summary: 'Turn maintenance mode on / off — settings.update (P1.SYS.03)',
      'x-permission': 'settings.update (company master: company scope)',
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/MaintenanceRequest' } },
        },
      },
      responses: {
        '200': {
          description: 'Updated',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/SystemStatus' } },
          },
        },
        default: PROBLEM_RESPONSE,
      },
    },
  },
};

export function buildOpenApiDocument(version: string): JsonSchema {
  return {
    openapi: '3.1.0',
    info: { title: 'Point Barbershop API', version },
    servers: [{ url: '/api/v1' }],
    paths: {
      '/health': {
        get: {
          tags: ['system'],
          operationId: 'health',
          summary: 'Liveness — DB ping only, no details (P1.SYS.01)',
          'x-permission': 'public (liveness — no details)',
          security: [],
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } },
            },
            default: PROBLEM_RESPONSE,
          },
        },
      },
      '/system/status': {
        get: {
          tags: ['system'],
          operationId: 'systemStatus',
          summary: 'Maintenance flag and server time — public (P1.SYS.02)',
          'x-permission': 'public (no session)',
          security: [],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/SystemStatus' } },
              },
            },
            default: PROBLEM_RESPONSE,
          },
        },
      },
      ...BRANCH_PATHS,
      // add-company-profile task 2.10 — P1.CO.01 / P1.CO.02 as Part 1 v1.7 lists them.
      '/company': {
        get: {
          tags: ['company'],
          operationId: 'getCompany',
          summary: 'Company info (P1.CO.01)',
          'x-permission': 'any staff',
          responses: {
            '200': { description: 'OK', ...json('Company') },
            '401': PROBLEM_RESPONSE,
          },
        },
        patch: {
          tags: ['company'],
          operationId: 'patchCompany',
          summary: 'Update company info — company.update (P1.CO.02)',
          'x-permission': 'company.update (company master: company scope)',
          parameters: [X_REQUESTED_WITH],
          requestBody: { required: true, ...json('CompanyUpdate') },
          responses: {
            '200': { description: 'Updated (enqueues site.content_changed)', ...json('Company') },
            '400': PROBLEM_RESPONSE,
            '401': PROBLEM_RESPONSE,
            '403': PROBLEM_RESPONSE,
            '409': PROBLEM_RESPONSE,
            '422': PROBLEM_RESPONSE,
          },
        },
      },
      ...SETTINGS_PATHS,
    },
    components: {
      schemas: {
        BranchAssignment: schema(branchAssignmentSchema),
        BranchSummary: schema(branchSummarySchema),
        Grant: schema(grantSchema),
        Health: schema(healthSchema),
        MeResponse: schema(meResponseSchema),
        Problem: schema(problemSchema),
        SystemStatus: schema(systemStatusSchema),
        // add-company-profile tasks 1.5 / 2.10 — P1.CO.01 / P1.CO.02.
        Company: schema(companySchema),
        CompanyUpdate: schema(companyUpdateSchema),
        SocialLinks: schema(socialLinksSchema),
        // add-settings-store task 1.7 — P1.SET.01 – 05.
        SettingDefinition: schema(settingDefinitionSchema),
        SettingHistoryItem: schema(settingHistoryItemSchema),
        SettingView: schema(settingViewSchema),
        // add-settings-store tasks 3.12 / 4.1 — the inline bodies of putSetting, resetSetting and
        // setMaintenance.
        SettingPutRequest: schema(settingPutBodySchema, 'input'),
        SettingResetRequest: schema(settingResetBodySchema, 'input'),
        MaintenanceRequest: schema(maintenanceBodySchema, 'input'),
        // add-walkin-visit-checkout tasks 2.2 – 2.5 — the response DTOs of Parts 2 / 3 / 4; their
        // endpoints are added with the controllers of this change.
        CommissionEstimate: schema(commissionEstimateSchema),
        CustomerLookup: schema(customerLookupSchema),
        DiscountRequest: schema(discountRequestSchema),
        DurationRange: schema(durationRangeSchema),
        Payment: schema(paymentSchema),
        PaymentMethod: schema(paymentMethodSchema),
        Category: schema(serviceCategorySchema),
        Quote: schema(quoteSchema),
        QuoteItem: schema(quoteItemSchema),
        ReceiptLine: schema(receiptLineSchema),
        ReceiptView: schema(receiptViewSchema),
        RefundSummary: schema(refundSummarySchema),
        RequestLookup: schema(requestLookupSchema),
        Sale: schema(saleSchema),
        SaleActions: schema(saleActionsSchema),
        SaleAdjustment: schema(saleAdjustmentSchema),
        SaleDiscount: schema(saleDiscountSchema),
        SaleItem: schema(saleItemSchema),
        ServiceListItem: schema(serviceListItemSchema),
        UpcomingBooking: schema(upcomingBookingSchema),
        Visit: schema(visitSchema),
        Warning: schema(warningSchema),
        // add-branch-management tasks 1.7 / 3.12 — P1.BR.02 – 05 (Part 1 v1.7 · owner BR1 – BR3).
        Branch: schema(branchSchema),
        BranchCreate: schema(branchCreateSchema),
        BranchUpdate: schema(branchUpdateSchema),
        BranchStatusRequest: schema(branchStatusSchema),
        BranchInUseContext: schema(branchInUseContextSchema),
      },
    },
  };
}
