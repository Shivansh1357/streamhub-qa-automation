import { z } from 'zod';
import { CHANNEL_TYPES, channelId, COUNTRY_CODE_PATTERN, isoDate } from './common';

/** `.strict()` everywhere: an extra field is a contract change, and the suite should notice it. */
export const channelSchema = z
  .object({
    id: channelId,
    name: z.string().min(1),
    country: z.string().regex(COUNTRY_CODE_PATTERN),
    type: z.enum(CHANNEL_TYPES),
    launchedAt: isoDate,
  })
  .strict();

export const channelListSchema = z
  .object({
    data: z.array(channelSchema),
    meta: z.object({ total: z.number().int().nonnegative() }).strict(),
  })
  .strict();

export type Channel = z.infer<typeof channelSchema>;
export type ChannelList = z.infer<typeof channelListSchema>;
export type ChannelType = Channel['type'];
