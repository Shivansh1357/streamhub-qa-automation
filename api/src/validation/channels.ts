import { z } from 'zod';
import { CHANNEL_TYPES } from '../types';
import { enumParam, patternParam, sortParam } from './params';
import { COUNTRY_CODE } from './patterns';

export const CHANNEL_SORT_FIELDS = ['name', 'launchedAt'] as const;

export const channelListQuerySchema = z
  .object({
    country: patternParam(COUNTRY_CODE, 'an ISO-3166 alpha-2 code in uppercase (for example GB)').optional(),
    type: enumParam(CHANNEL_TYPES).optional(),
    sort: sortParam(CHANNEL_SORT_FIELDS).default('name'),
  })
  .strict();

export type ChannelListQuery = z.output<typeof channelListQuerySchema>;
