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
  serviceListItemSchema,
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

const schema = (zodSchema: z.ZodType): JsonSchema => {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(zodSchema, {
    io: 'output',
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
