import type { z } from 'zod';
import { audienceSummarySchema } from './audience.schema';
import { channelListSchema, channelSchema } from './channel.schema';
import { errorEnvelopeSchema } from './error.schema';
import { healthSchema } from './health.schema';
import { programmeDetailSchema, programmeListSchema, programmeSchema } from './programme.schema';

/**
 * Names a Gherkin step can refer to ("the response should match the ProgrammeList schema").
 * Keeping the lookup here means a feature file never has to know where a schema lives.
 */
export const schemaRegistry = {
  Health: healthSchema,
  Channel: channelSchema,
  ChannelList: channelListSchema,
  Programme: programmeSchema,
  ProgrammeDetail: programmeDetailSchema,
  ProgrammeList: programmeListSchema,
  AudienceSummary: audienceSummarySchema,
  ErrorEnvelope: errorEnvelopeSchema,
} satisfies Record<string, z.ZodType>;

export type SchemaName = keyof typeof schemaRegistry;

export function isSchemaName(name: string): name is SchemaName {
  return Object.prototype.hasOwnProperty.call(schemaRegistry, name);
}

export function schemaByName(name: string): z.ZodType {
  if (!isSchemaName(name)) {
    throw new Error(`Unknown schema "${name}". Known schemas: ${Object.keys(schemaRegistry).join(', ')}`);
  }
  return schemaRegistry[name];
}

export * from './audience.schema';
export * from './channel.schema';
export * from './common';
export * from './error.schema';
export * from './health.schema';
export * from './programme.schema';
