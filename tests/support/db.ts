import { Pool } from 'pg';
import { env } from '../../config/env';

let pool: Pool | undefined;

export function getDbPool(): Pool {
  if (!env.db.url) {
    throw new Error(
      'DATABASE_URL is not set. Point it at a PostgreSQL database (see docker-compose.yml / sql/README.md).',
    );
  }
  pool ??= new Pool({ connectionString: env.db.url, max: 4 });
  return pool;
}

export async function closeDbPool(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end();
}
