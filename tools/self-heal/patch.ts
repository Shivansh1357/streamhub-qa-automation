/**
 * Turns validated candidates into reviewable output: a unified diff against the page object, a Markdown
 * report and a JSON report. `applyFixes` is the opt-in last step: it edits the source, re-runs the single
 * failing scenario and keeps the change only when that scenario passes.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { stripAnsi } from './detect';
import type { ProviderUsage } from './providers/types';
import type { DetectedFailure } from './types';
import { toPlaywrightCode, type ValidationResult } from './validate';

export interface Fix {
  file: string;
  line: number;
  original: string;
  replacement: string;
}

export interface HealingRecord {
  failure: DetectedFailure;
  provider: { name: string; model?: string; usage?: ProviderUsage; warnings: string[]; error?: string };
  context?: { originalChars: number; trimmedChars: number; elements: number; containers: number };
  /** Ranked: validated first, then by locator policy, then by confidence. */
  candidates: ValidationResult[];
  chosen?: ValidationResult;
  fix?: Fix;
  notes: string[];
}

export interface RunMeta {
  generatedAt: string;
  rootDir: string;
  reportPath: string;
  provider: string;
  providerReason: string;
  model: string;
  live: boolean;
  apply: boolean;
  command: string;
}

/** Replaces the broken expression on its source line; the receiver (this.page) and indentation are untouched. */
export function buildFix(failure: DetectedFailure, chosen: ValidationResult): { fix?: Fix; note?: string } {
  const { source, locator } = failure;
  if (!source || !locator)
    return { note: 'no source location: the page object line could not be found, so the fix is report-only' };
  const exactMatches = failure.sourceCandidates.filter((c) => c.match === 'expression');
  if (exactMatches.length > 1) {
    return {
      note: `the expression appears ${exactMatches.length} times under tests/pages; a human must pick the line, so the fix is report-only`,
    };
  }
  if (source.match !== 'expression') {
    return {
      note: 'the source line only matched the locator literal (expression split or formatted differently); the fix is report-only',
    };
  }
  // Replacer function so the generated code is inserted literally ($& / $1 in model output must never expand).
  const generated = toPlaywrightCode(chosen.candidate);
  const replacement = source.lineText.replace(locator.expression, () => generated);
  return { fix: { file: source.file, line: source.line, original: source.lineText, replacement } };
}

interface Hunk {
  start: number;
  end: number;
  fixes: Fix[];
}

/** A unified diff with 3 lines of context; fixes close to each other share a hunk so `patch -p1` applies cleanly. */
export function unifiedDiff(rootDir: string, fixes: Fix[]): string {
  const byFile = new Map<string, Fix[]>();
  for (const fix of fixes) byFile.set(fix.file, [...(byFile.get(fix.file) ?? []), fix]);
  const out: string[] = [];
  for (const [file, fileFixes] of byFile) {
    const lines = fs.readFileSync(path.join(rootDir, file), 'utf8').split('\n');
    const hunks: Hunk[] = [];
    for (const fix of [...fileFixes].sort((a, b) => a.line - b.line)) {
      const start = Math.max(1, fix.line - 3);
      const end = Math.min(lines.length, fix.line + 3);
      const last = hunks[hunks.length - 1];
      if (last && start <= last.end + 1) {
        last.end = Math.max(last.end, end);
        last.fixes.push(fix);
      } else hunks.push({ start, end, fixes: [fix] });
    }
    out.push(`--- a/${file}`, `+++ b/${file}`);
    for (const hunk of hunks) {
      const count = hunk.end - hunk.start + 1;
      out.push(`@@ -${hunk.start},${count} +${hunk.start},${count} @@`);
      for (let n = hunk.start; n <= hunk.end; n++) {
        const fix = hunk.fixes.find((f) => f.line === n);
        if (fix) out.push(`-${fix.original}`, `+${fix.replacement}`);
        else out.push(` ${lines[n - 1]}`);
      }
    }
  }
  return out.length ? `${out.join('\n')}\n` : '';
}

function cell(text: string | undefined): string {
  return (text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function yesNo(value: boolean | undefined): string {
  return value === undefined ? '-' : value ? 'yes' : 'no';
}

function usageText(usage: ProviderUsage | undefined): string {
  if (!usage) return 'n/a';
  const parts: string[] = [];
  if (usage.inputTokens !== undefined) parts.push(`input ${usage.inputTokens}`);
  if (usage.cacheReadTokens) parts.push(`cache read ${usage.cacheReadTokens}`);
  if (usage.cacheWriteTokens) parts.push(`cache write ${usage.cacheWriteTokens}`);
  if (usage.outputTokens !== undefined) parts.push(`output ${usage.outputTokens}`);
  if (usage.costUsd !== undefined) parts.push(`cost $${usage.costUsd.toFixed(4)}`);
  if (usage.durationMs !== undefined) parts.push(`${(usage.durationMs / 1000).toFixed(1)}s`);
  return parts.length ? parts.join(', ') : 'n/a';
}

function verdict(result: ValidationResult): string {
  return result.ok ? 'validated' : 'rejected';
}

export function renderMarkdown(records: HealingRecord[], meta: RunMeta): string {
  const lines: string[] = [];
  const relativeReport = path.relative(meta.rootDir, meta.reportPath);
  lines.push('# Self-healing locator report', '');
  lines.push(`- Generated: ${meta.generatedAt}`);
  lines.push(`- Source report: \`${relativeReport}\``);
  lines.push(`- Provider: **${meta.provider}** (${meta.providerReason}); model: \`${meta.model}\``);
  lines.push(
    `- Live validation against the real page: ${meta.live ? 'yes' : 'no'}; apply mode: ${meta.apply ? 'yes' : 'no'}`,
  );
  lines.push(`- Command: \`${meta.command}\``, '');
  lines.push('## Summary', '');
  lines.push('| # | Scenario | Error class | Original locator | Chosen fix | Confidence | Status |');
  lines.push('|---|----------|-------------|------------------|------------|------------|--------|');
  records.forEach((record, index) => {
    const status = record.provider.error
      ? 'provider error'
      : record.failure.failureClass === 'not-a-locator-failure'
        ? 'not a locator failure'
        : record.chosen
          ? record.fix
            ? 'fix proposed'
            : 'validated (report-only)'
          : record.candidates.length
            ? 'no candidate validated'
            : 'no candidates';
    lines.push(
      `| ${index + 1} | ${cell(record.failure.scenarioName)} | ${record.failure.failureClass} | \`${cell(record.failure.locator?.expression ?? '-')}\` | ${record.chosen ? `\`${cell(record.chosen.code)}\`` : '-'} | ${record.chosen ? record.chosen.candidate.confidence.toFixed(2) : '-'} | ${status} |`,
    );
  });
  lines.push('');
  records.forEach((record, index) => {
    const { failure } = record;
    lines.push(`## ${index + 1}. ${failure.scenarioName}`, '');
    lines.push(`- Feature: ${failure.featureName} (\`${failure.featureUri}:${failure.scenarioLine}\`)`);
    lines.push(
      `- Failing step: \`${failure.stepKeyword} ${cell(failure.stepText)}\`${failure.stepDefinition ? ` (step definition \`${failure.stepDefinition}\`)` : ''}`,
    );
    lines.push(
      `- Original locator: \`${failure.locator?.expression ?? '-'}\` (${failure.locator?.kind ?? 'none'})${failure.apiCall ? `, call \`${failure.apiCall}\`` : ''}`,
    );
    lines.push(
      `- Source: ${failure.source ? `\`${failure.source.file}:${failure.source.line}\` (${failure.source.match} match)` : 'not found under tests/pages'}`,
    );
    lines.push(`- Error class: **${failure.failureClass}** - ${failure.classificationReason}`);
    lines.push(`- Inferred intent: ${failure.intent.summary}`);
    if (record.context) {
      lines.push(
        `- Context sent: trimmed DOM ${record.context.trimmedChars} of ${record.context.originalChars} chars, ${record.context.elements} candidate elements, ${record.context.containers} containers`,
      );
    }
    lines.push(
      `- Provider: ${record.provider.name}${record.provider.model ? ` / \`${record.provider.model}\`` : ''}; usage: ${usageText(record.provider.usage)}`,
    );
    if (record.provider.error) lines.push(`- Provider error: ${record.provider.error}`);
    for (const warning of record.provider.warnings) lines.push(`- Provider warning: ${warning}`);
    for (const note of record.notes) lines.push(`- Note: ${note}`);
    lines.push('', '```', failure.errorExcerpt.split('\n').slice(0, 8).join('\n'), '```', '');
    if (record.candidates.length) {
      lines.push('### Candidates', '');
      lines.push(
        '| Rank | Strategy | Playwright code | Confidence | Snapshot matches | Compatible | Visible | Live matches | Verdict | Notes |',
      );
      lines.push(
        '|------|----------|-----------------|------------|------------------|------------|---------|--------------|---------|-------|',
      );
      record.candidates.forEach((result, rank) => {
        const live = result.live
          ? result.live.error
            ? 'error'
            : String(result.live.matches)
          : meta.live
            ? 'skipped'
            : '-';
        lines.push(
          `| ${rank + 1} | ${result.candidate.strategy} | \`${cell(result.code)}\` | ${result.candidate.confidence.toFixed(2)} | ${result.snapshot.matches} | ${yesNo(result.snapshot.compatible)} | ${yesNo(result.snapshot.visible)} | ${live} | ${verdict(result)} | ${cell(result.notes.join('; ')) || '-'} |`,
        );
      });
      lines.push('', 'Rationales:', '');
      record.candidates.forEach((result, rank) =>
        lines.push(`${rank + 1}. ${cell(result.candidate.rationale)}`),
      );
      lines.push('');
    }
    if (record.chosen) {
      lines.push('### Chosen fix', '');
      lines.push(
        `\`${record.chosen.code}\` (confidence ${record.chosen.candidate.confidence.toFixed(2)})`,
        '',
      );
      lines.push(`Rationale: ${record.chosen.candidate.rationale}`, '');
      if (record.fix)
        lines.push(
          '```diff',
          `- ${record.fix.original.trim()}`,
          `+ ${record.fix.replacement.trim()}`,
          '```',
          '',
        );
    }
  });
  return lines.join('\n');
}

export function writeReports(
  records: HealingRecord[],
  meta: RunMeta,
  outDir: string,
): { markdown: string; json: string; patch: string } {
  fs.mkdirSync(outDir, { recursive: true });
  const markdown = path.join(outDir, 'healing-report.md');
  const json = path.join(outDir, 'healing-report.json');
  const patch = path.join(outDir, 'proposed-fixes.patch');
  fs.writeFileSync(markdown, renderMarkdown(records, meta));
  const serialisable = records.map((record) => ({
    ...record,
    failure: { ...record.failure, errorMessage: undefined },
  }));
  fs.writeFileSync(json, `${JSON.stringify({ meta, records: serialisable }, null, 2)}\n`);
  fs.writeFileSync(
    patch,
    unifiedDiff(
      meta.rootDir,
      records.flatMap((r) => (r.fix ? [r.fix] : [])),
    ),
  );
  return { markdown, json, patch };
}

export interface ApplyOutcome {
  scenario: string;
  file: string;
  line: number;
  code: string;
  passed: boolean;
  kept: boolean;
  exitCode: number | null;
}

export interface ApplyOptions {
  rootDir: string;
  outDir: string;
  /** Cucumber profile whose report files are preserved across the re-run. */
  profile: string;
  log: (line: string) => void;
}

const REPORT_FILES = ['cucumber-report.json', 'cucumber-report.html', 'junit.xml'];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Applies one fix at a time and re-runs only its scenario with the self-healing profile. The profile's own
 * report files are restored afterwards so the evidence from the full broken run is not overwritten.
 */
export function applyFixes(records: HealingRecord[], options: ApplyOptions): ApplyOutcome[] {
  const outcomes: ApplyOutcome[] = [];
  const reportsDir = path.join(options.rootDir, 'reports', 'self-healing');
  for (const record of records) {
    if (!record.fix || !record.chosen) continue;
    const { fix } = record;
    const absolute = path.join(options.rootDir, fix.file);
    const before = fs.readFileSync(absolute, 'utf8');
    const lines = before.split('\n');
    if (lines[fix.line - 1] !== fix.original) {
      options.log(
        `SKIP ${fix.file}:${fix.line} changed since detection; expected ${JSON.stringify(fix.original.trim())}`,
      );
      continue;
    }
    lines[fix.line - 1] = fix.replacement;
    fs.writeFileSync(absolute, lines.join('\n'));
    options.log(`APPLY ${fix.file}:${fix.line}`);
    options.log(`  - ${fix.original.trim()}`);
    options.log(`  + ${fix.replacement.trim()}`);
    const saved = new Map<string, Buffer>();
    for (const name of REPORT_FILES) {
      const file = path.join(reportsDir, name);
      if (fs.existsSync(file)) saved.set(file, fs.readFileSync(file));
    }
    const pattern = `^${escapeRegex(record.failure.scenarioName)}$`;
    const args = ['cucumber-js', '--profile', options.profile, '--name', pattern];
    options.log(`RUN npx ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
    const run = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
      cwd: options.rootDir,
      encoding: 'utf8',
      env: process.env,
    });
    const output = stripAnsi(`${run.stdout ?? ''}${run.stderr ?? ''}`).trim();
    for (const line of output.split('\n').slice(-25)) options.log(`  | ${line}`);
    for (const [file, content] of saved) fs.writeFileSync(file, content);
    const passed = run.status === 0;
    if (!passed) {
      fs.writeFileSync(absolute, before);
      options.log(`REVERT ${fix.file}:${fix.line} (scenario still fails, exit code ${run.status})`);
    } else {
      options.log(`KEEP ${fix.file}:${fix.line} (scenario passed)`);
    }
    outcomes.push({
      scenario: record.failure.scenarioName,
      file: fix.file,
      line: fix.line,
      code: record.chosen.code,
      passed,
      kept: passed,
      exitCode: run.status,
    });
  }
  return outcomes;
}
