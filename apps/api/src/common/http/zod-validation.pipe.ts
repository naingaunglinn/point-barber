import { Body, type PipeTransform, Param, Query } from '@nestjs/common';
import { ErrorCode } from '@point/shared';
import type { z } from 'zod';

import { ProblemException } from './problem.exception.js';
import { toFieldErrors } from './zod-issues.js';

// Input is parsed by a Zod schema from packages/shared (API-ERR-03 · CG-API-03 · design D8). A
// failure answers 400 `validation` with one errors[] item per failed field, before the handler runs.
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new ProblemException(ErrorCode.VALIDATION, 400, {
      errors: toFieldErrors(result.error.issues),
    });
  }
}

/** The request body, parsed by `schema`. */
export const ZBody = (schema: z.ZodType): ParameterDecorator => Body(new ZodValidationPipe(schema));
/** The query string, parsed by `schema`. */
export const ZQuery = (schema: z.ZodType): ParameterDecorator =>
  Query(new ZodValidationPipe(schema));
/** The path parameters, parsed by `schema`. */
export const ZParam = (schema: z.ZodType): ParameterDecorator =>
  Param(new ZodValidationPipe(schema));
