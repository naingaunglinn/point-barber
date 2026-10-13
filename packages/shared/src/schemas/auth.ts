import { z } from 'zod';

import { ErrorCode } from '../constants/error-codes.js';
import { catalogueCode } from './catalogue-code.js';

// Sign-in request schemas (P1.AUTH.01–03 · API-ERR-03 · design D4 · D7). Request schemas, so plain
// z.object: unknown members are stripped, never rejected (CG-API-03).

/**
 * Trimmed and lower-cased, then at most 255 characters (`too_big`, `maximum` 255), then an e-mail
 * address (`email_invalid`). The length check comes first, so a long address reports `too_big`.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .pipe(z.email(catalogueCode(ErrorCode.EMAIL_INVALID)));

/** 8 digits, a leading zero included (D-AUTH-04). */
export const otpCodeSchema = z.string().regex(/^[0-9]{8}$/, catalogueCode(ErrorCode.OTP_FORMAT));

/** P1.AUTH.01 `POST /v1/auth/otp/request` */
export const otpRequestSchema = z.object({ email: emailSchema });

/** P1.AUTH.02 `POST /v1/auth/otp/verify` */
export const otpVerifySchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  device_label: z.string().max(255).optional(),
});

/**
 * P1.AUTH.03 `GET /v1/auth/google/start`. `return_to` is checked against the app origin by the
 * service and dropped when it fails — never answered with 400 (D7). `client` and `challenge`
 * arrive with P1.AUTH.06 in add-android-shell.
 */
export const googleStartQuerySchema = z.object({ return_to: z.string().optional() });

export type OtpRequest = z.infer<typeof otpRequestSchema>;
export type OtpVerify = z.infer<typeof otpVerifySchema>;
export type GoogleStartQuery = z.infer<typeof googleStartQuerySchema>;
