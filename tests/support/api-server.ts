import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env';

let child: ChildProcess | undefined;
let ready: Promise<void> | undefined;

export async function isApiHealthy(timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(new URL('/health', env.api.baseUrl), { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Makes sure the API under test is reachable. If it is not, and API_AUTO_START=true, the server is
 * spawned from source (ts-node) and its output is written to reports/logs/api-server.log.
 * The promise is cached so the server is started at most once per test run.
 */
export function ensureApiServer(): Promise<void> {
  ready ??= (async () => {
    if (await isApiHealthy()) return;
    if (!env.api.autoStart) {
      throw new Error(
        `API is not reachable at ${env.api.baseUrl} and API_AUTO_START=false. Start it with "npm run api:start".`,
      );
    }
    const logDir = path.join(env.reportsDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const log = fs.openSync(path.join(logDir, 'api-server.log'), 'a');
    child = spawn(
      process.execPath,
      [require.resolve('ts-node/dist/bin.js'), '--transpile-only', path.join(env.rootDir, 'api', 'src', 'server.ts')],
      { cwd: env.rootDir, env: { ...process.env, PORT: String(env.api.port) }, stdio: ['ignore', log, log] },
    );
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`API server exited early (code ${child.exitCode}) - see reports/logs/api-server.log`);
      }
      if (await isApiHealthy()) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for the API server at ${env.api.baseUrl} to become healthy`);
  })();
  return ready;
}

export async function stopApiServer(): Promise<void> {
  const proc = child;
  child = undefined;
  ready = undefined;
  if (!proc || proc.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve();
    }, 3000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    proc.kill('SIGTERM');
  });
}
