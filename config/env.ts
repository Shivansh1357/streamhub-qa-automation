/**
 * Typed environment configuration.
 *
 * Resolution order (highest priority first):
 *   1. real process environment (e.g. `HEADLESS=false npm run test:ui`)
 *   2. `.env` in the repo root (git-ignored, personal overrides)
 *   3. `config/env/<TEST_ENV>.env` (committed, per-environment defaults; TEST_ENV defaults to "local")
 *
 * Nothing in the test code reads process.env directly - everything goes through `env`.
 */
import * as dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

const TEST_ENV = process.env.TEST_ENV ?? 'local';
const ROOT = path.resolve(__dirname, '..');

for (const file of [path.join(ROOT, '.env'), path.join(ROOT, 'config', 'env', `${TEST_ENV}.env`)]) {
  if (fs.existsSync(file)) {
    // dotenv never overrides variables that are already set, which gives us the priority order above.
    dotenv.config({ path: file, quiet: true });
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name} (TEST_ENV=${TEST_ENV})`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed))
    throw new Error(`Environment variable ${name} must be an integer, got "${value}"`);
  return parsed;
}

export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export type TraceMode = 'on' | 'off' | 'on-failure';
export type SelfHealProvider = 'auto' | 'anthropic' | 'claude-cli' | 'offline';

export const env = {
  name: TEST_ENV,
  rootDir: ROOT,
  reportsDir: path.join(ROOT, 'reports'),
  ui: {
    baseUrl: required('UI_BASE_URL'),
    headless: bool('HEADLESS', true),
    browser: optional('BROWSER', 'chromium') as BrowserName,
    slowMo: int('SLOW_MO_MS', 0),
    stepTimeoutMs: int('UI_STEP_TIMEOUT_MS', 90_000),
    actionTimeoutMs: int('UI_ACTION_TIMEOUT_MS', 20_000),
    trace: optional('UI_TRACE', 'on-failure') as TraceMode,
    video: bool('UI_VIDEO', false),
  },
  api: {
    baseUrl: required('API_BASE_URL'),
    port: int('API_PORT', 4010),
    autoStart: bool('API_AUTO_START', true),
  },
  db: {
    url: process.env.DATABASE_URL,
  },
  selfHeal: {
    provider: optional('SELF_HEAL_PROVIDER', 'auto') as SelfHealProvider,
    model: optional('SELF_HEAL_MODEL', 'claude-opus-5-5'),
  },
} as const;

export type Env = typeof env;
