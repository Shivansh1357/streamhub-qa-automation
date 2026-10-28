/**
 * Suggestion backend on the locally installed Claude Code CLI (`claude -p`). Useful on a developer machine
 * that is logged in to Claude Code but has no API key. The CLI has no structured-output mode, so the JSON
 * contract is enforced after the fact: extract the first {...} object from the answer, validate with zod.
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import { SYSTEM_PROMPT, buildUserPrompt, parseCandidatesFromText } from './prompt';
import type { HealingInput, LocatorProvider, ProviderResult } from './types';

const TIMEOUT_MS = 240_000;

/** The subset of the `--output-format json` envelope this tool reads. */
interface CliEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

interface CliRun {
  stdout: string;
  stderr: string;
  code: number | null;
  durationMs: number;
}

/**
 * CLAUDECODE is set inside a Claude Code session; a nested CLI refuses to start while it is present.
 * The cwd is a temp dir so the CLI does not pick up this repository's CLAUDE.md / settings as context.
 */
function cliEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

function runCli(executable: string, args: string[]): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(executable, args, {
      env: cliEnvironment(),
      cwd: os.tmpdir(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Could not start "${executable}": ${error.message}`, { cause: error }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      if (timedOut)
        reject(
          new Error(
            `"${executable}" timed out after ${TIMEOUT_MS / 1000}s. stderr: ${stderr.trim().slice(-1000)}`,
          ),
        );
      else resolve({ stdout, stderr, code, durationMs });
    });
  });
}

export class ClaudeCliProvider implements LocatorProvider {
  readonly name = 'claude-cli';

  constructor(private readonly executable = 'claude') {}

  async suggest(input: HealingInput): Promise<ProviderResult> {
    const prompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(input)}`;
    // The prompt embeds DOM captured from a third-party site, so the CLI runs with every tool disabled: a
    // prompt-injection attempt can at worst produce bad candidates, which the validator then rejects.
    const args = [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--model',
      input.model,
      '--max-turns',
      '1',
      '--tools',
      '',
    ];
    const run = await runCli(this.executable, args);
    if (run.code !== 0) {
      throw new Error(
        `"${this.executable}" exited with code ${run.code}. stderr: ${run.stderr.trim().slice(-2000) || '(empty)'}`,
      );
    }
    let envelope: CliEnvelope;
    try {
      envelope = JSON.parse(run.stdout) as CliEnvelope;
    } catch (error) {
      throw new Error(`"${this.executable}" did not print a JSON envelope: ${run.stdout.slice(0, 500)}`, {
        cause: error,
      });
    }
    if (envelope.is_error || typeof envelope.result !== 'string') {
      throw new Error(
        `"${this.executable}" reported an error (${envelope.subtype ?? envelope.type ?? 'unknown'}): ${envelope.result ?? run.stderr.trim().slice(-1000)}`,
      );
    }
    const { candidates, warnings } = parseCandidatesFromText(envelope.result);
    if (run.stderr.trim()) warnings.push(`CLI stderr: ${run.stderr.trim().slice(-500)}`);
    return {
      candidates,
      model: input.model,
      usage: {
        inputTokens: envelope.usage?.input_tokens,
        outputTokens: envelope.usage?.output_tokens,
        cacheReadTokens: envelope.usage?.cache_read_input_tokens,
        cacheWriteTokens: envelope.usage?.cache_creation_input_tokens,
        costUsd: envelope.total_cost_usd,
        durationMs: run.durationMs,
      },
      warnings,
    };
  }
}
