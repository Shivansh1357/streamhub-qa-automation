import fs from 'node:fs';
import path from 'node:path';
import type { SelfHealProvider } from '../../../config/env';
import { AnthropicProvider } from './anthropic';
import { ClaudeCliProvider } from './claude-cli';
import { OfflineProvider } from './offline';
import type { LocatorProvider } from './types';

export type {
  Candidate,
  HealingInput,
  LocatorProvider,
  ProviderResult,
  ProviderUsage,
  Strategy,
} from './types';

export const PROVIDER_NAMES: readonly SelfHealProvider[] = ['auto', 'anthropic', 'claude-cli', 'offline'];

/** Finds an executable on PATH without spawning a shell. */
export function findExecutable(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const names = process.platform === 'win32' ? [name, `${name}.cmd`, `${name}.exe`] : [name];
  for (const dir of (env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const file of names) {
      const full = path.join(dir, file);
      try {
        fs.accessSync(full, fs.constants.X_OK);
        if (fs.statSync(full).isFile()) return full;
      } catch {
        // not here; keep scanning
      }
    }
  }
  return undefined;
}

export interface ResolvedProvider {
  provider: LocatorProvider;
  reason: string;
}

export function resolveProvider(name: SelfHealProvider): ResolvedProvider {
  switch (name) {
    case 'anthropic':
      return { provider: new AnthropicProvider(), reason: 'requested' };
    case 'claude-cli': {
      const executable = findExecutable('claude');
      return {
        provider: new ClaudeCliProvider(executable ?? 'claude'),
        reason: executable
          ? `requested (${executable})`
          : 'requested (claude not found on PATH; spawning by name)',
      };
    }
    case 'offline':
      return { provider: new OfflineProvider(), reason: 'requested' };
    case 'auto': {
      if (process.env.ANTHROPIC_API_KEY)
        return { provider: new AnthropicProvider(), reason: 'auto: ANTHROPIC_API_KEY is set' };
      const executable = findExecutable('claude');
      if (executable)
        return {
          provider: new ClaudeCliProvider(executable),
          reason: `auto: found Claude Code CLI at ${executable}`,
        };
      return {
        provider: new OfflineProvider(),
        reason: 'auto: no API key and no claude executable; using the heuristic',
      };
    }
    default:
      throw new Error(`Unknown provider "${name as string}" (expected ${PROVIDER_NAMES.join(' | ')})`);
  }
}
