import { Controller, Get, Param, Post } from '@nestjs/common';
import { catalogueCode, type ListQuery, listQuerySchema } from '@point/shared';
import { z } from 'zod';

import { Public } from '../../src/common/access/public.decorator.js';
import { ZBody, ZQuery } from '../../src/common/http/zod-validation.pipe.js';

// Fixture endpoints for the integration tests (design D8). Registered only in the test application
// module — never in AppModule (a unit test and edge.spec.ts check that).
export const itemsBodySchema = z.object({
  name: z.string().min(1),
  items: z.array(z.object({ quantity: z.number() })).min(1),
  phone: z
    .string()
    .regex(/^\+?[0-9]{9,15}$/, catalogueCode('phone_invalid'))
    .optional(),
});
type ItemsBody = z.infer<typeof itemsBodySchema>;

export const fixtureCalls = { create: 0 };

@Controller('v1/_fixtures')
export class FixturesController {
  @Post('items')
  @Public()
  create(@ZBody(itemsBodySchema) body: ItemsBody): ItemsBody {
    fixtureCalls.create += 1;
    return body;
  }

  @Get('items')
  @Public()
  list(@ZQuery(listQuerySchema) query: ListQuery): { limit: number } {
    return { limit: query.limit };
  }

  /** A path with an id: the request log carries the pattern, never the id (task 2.6). */
  @Get('items/:id')
  @Public()
  one(@Param('id') id: string): { id: string } {
    return { id };
  }

  @Get('boom')
  @Public()
  boom(): never {
    throw new Error('boom: db password=s3cret');
  }
}
