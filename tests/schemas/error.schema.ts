import { z } from 'zod';

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_ID',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'INTERNAL_ERROR',
] as const;

export const errorDetailSchema = z.object({ field: z.string().min(1), message: z.string().min(1) }).strict();

/** Every non-2xx response must have exactly this shape, whatever the endpoint. */
export const errorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.enum(ERROR_CODES),
        message: z.string().min(1),
        details: z.array(errorDetailSchema).min(1).optional(),
      })
      .strict(),
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ErrorCode = (typeof ERROR_CODES)[number];
