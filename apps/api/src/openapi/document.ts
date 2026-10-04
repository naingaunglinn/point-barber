import { healthSchema, problemSchema, systemStatusSchema } from '@point/shared';
import { z } from 'zod';

// The OpenAPI document, generated from the Zod schemas of packages/shared (API-ERR-03 · design D5).
// Paths are relative to `servers[0].url`, as openapi/part1-foundation.yaml writes them. Written to
// dist/openapi.json by `pnpm --filter api openapi`; no documentation endpoint is served. The full
// contract comparison with point-sdd (`openapi:check`) belongs to add-ci-guard-rails.

type JsonSchema = Record<string, unknown>;

const schema = (zodSchema: z.ZodType): JsonSchema => {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(zodSchema, { io: 'output' });
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
        Health: schema(healthSchema),
        Problem: schema(problemSchema),
        SystemStatus: schema(systemStatusSchema),
      },
    },
  };
}
