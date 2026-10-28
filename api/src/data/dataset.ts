import fs from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import type { AudienceRow, Channel, Programme } from '../types';
import { audienceFileSchema, channelsFileSchema, programmesFileSchema } from './schemas';

export interface Dataset {
  channels: Channel[];
  programmes: Programme[];
  audience: AudienceRow[];
}

/** Thrown when the data files are missing, malformed or internally inconsistent. */
export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetError';
  }
}

export function readJsonFile<S extends z.ZodType>(file: string, schema: S): z.output<S> {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new DatasetError(`Cannot read ${file}: ${(error as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new DatasetError(`${path.basename(file)} is not valid JSON: ${(error as Error).message}`);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const problems = result.error.issues
      .slice(0, 5)
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new DatasetError(`${path.basename(file)} failed validation:\n${problems}`);
  }
  return result.data;
}

function assertUnique(label: string, keys: string[]): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) throw new DatasetError(`Duplicate ${label}: ${key}`);
    seen.add(key);
  }
}

/**
 * Referential integrity is enforced here rather than per request: it lets the services treat a
 * programme's channel as guaranteed to exist and keeps aggregation code free of defensive branches.
 */
function assertIntegrity(dataset: Dataset): void {
  assertUnique(
    'channel id',
    dataset.channels.map((channel) => channel.id),
  );
  assertUnique(
    'programme id',
    dataset.programmes.map((programme) => programme.id),
  );
  assertUnique(
    'audience row (programmeId, date)',
    dataset.audience.map((row) => `${row.programmeId}@${row.date}`),
  );

  const channelIds = new Set(dataset.channels.map((channel) => channel.id));
  for (const programme of dataset.programmes) {
    if (!channelIds.has(programme.channelId)) {
      throw new DatasetError(`Programme ${programme.id} references unknown channel ${programme.channelId}`);
    }
  }
  const programmeIds = new Set(dataset.programmes.map((programme) => programme.id));
  for (const row of dataset.audience) {
    if (!programmeIds.has(row.programmeId)) {
      throw new DatasetError(`Audience row ${row.programmeId}@${row.date} references an unknown programme`);
    }
  }
}

export function loadDataset(dir: string): Dataset {
  const dataset: Dataset = {
    channels: readJsonFile(path.join(dir, 'channels.json'), channelsFileSchema),
    programmes: readJsonFile(path.join(dir, 'programmes.json'), programmesFileSchema),
    audience: readJsonFile(path.join(dir, 'audience.json'), audienceFileSchema),
  };
  assertIntegrity(dataset);
  return dataset;
}
