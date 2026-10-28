import fs from 'node:fs/promises';
import path from 'node:path';
import { types } from 'pg';
import type { CustomTypesConfig, Pool } from 'pg';
import { env } from '../../../config/env';

/**
 * The SQL scenarios execute the very files a reviewer reads and runs by hand
 * (sql/schema.sql, sql/seed.sql, sql/queries/*.sql). Nothing is duplicated
 * into the test code, so the tests cannot drift from the deliverable.
 */
const SQL_DIR = path.join(env.rootDir, 'sql');
const QUERIES_DIR = path.join(SQL_DIR, 'queries');
const SCHEMA_FILE = path.join(SQL_DIR, 'schema.sql');
const SEED_FILE = path.join(SQL_DIR, 'seed.sql');

/** A query name is the file name without `.sql`; anything else would be a path-traversal mistake. */
const QUERY_NAME = /^[a-z0-9_-]+$/i;

export type ResultRow = Record<string, unknown>;

/**
 * Return DATE columns as the literal 'YYYY-MM-DD' text PostgreSQL sends. pg would otherwise
 * build a JS Date at local midnight, and turning that back into a date string is exactly
 * where off-by-one-day bugs creep in on machines with a non-UTC time zone.
 */
const literalDateTypes: CustomTypesConfig = {
  getTypeParser: (oid, format) =>
    oid === types.builtins.DATE ? (value: string) => value : types.getTypeParser(oid, format),
};

export function queryFilePath(name: string): string {
  if (!QUERY_NAME.test(name)) {
    throw new Error(
      `Invalid query name "${name}" - use the file name without .sql, e.g. 01_round_trip_transfers`,
    );
  }
  return path.join(QUERIES_DIR, `${name}.sql`);
}

/** Applies schema.sql then seed.sql, each as one multi-statement script - the same thing `psql -f` does. */
export async function loadSchemaAndSeed(db: Pool): Promise<void> {
  for (const file of [SCHEMA_FILE, SEED_FILE]) {
    await db.query(await fs.readFile(file, 'utf8'));
  }
}

export async function runQueryFile(db: Pool, name: string): Promise<ResultRow[]> {
  const text = await fs.readFile(queryFilePath(name), 'utf8');
  const result = await db.query<ResultRow>({ text, types: literalDateTypes });
  return result.rows;
}
