import { z } from 'zod';

export const healthSchema = z
  .object({
    status: z.literal('ok'),
    uptimeSeconds: z.number().int().nonnegative(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, { error: 'must be a semantic version' }),
  })
  .strict();

export type Health = z.infer<typeof healthSchema>;
