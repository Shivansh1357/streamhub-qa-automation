import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env';

/** Turn a scenario name into a safe, stable file name. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function artifactPath(profile: string, kind: string, fileName: string): string {
  const dir = path.join(env.reportsDir, profile, kind);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, fileName);
}
