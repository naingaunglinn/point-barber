import {
  branchAssignmentSchema,
  branchSummarySchema,
  commissionEstimateSchema,
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
      },
    },
  };
}
