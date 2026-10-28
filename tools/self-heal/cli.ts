/**
 * npm run heal -- [--report <path>] [--provider auto|anthropic|claude-cli|offline] [--model <id>]
 *                 [--live] [--apply] [--out <dir>] [--max-failures <n>]
 *
 * Pipeline: detect (Cucumber JSON) -> context (saved DOM + aria) -> suggest (provider) -> validate (headless
 * Chromium) -> patch + report. Nothing is written to the page object unless --apply is given, and even
 * then a fix is kept only when its scenario passes. Exit 0 when every locator failure got a validated
 * candidate, 1 otherwise, 2 on an unexpected error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { env, type SelfHealProvider } from '../../config/env';
import { buildContext, loadSnapshots } from './context';
import { detectFailures, readCucumberReport } from './detect';
import { applyFixes, buildFix, writeReports, type HealingRecord, type RunMeta } from './patch';
import { PROVIDER_NAMES, resolveProvider } from './providers';
import { Validator } from './validate';

const USAGE = `Usage: npm run heal -- [options]

  --report <path>        Cucumber JSON report (default reports/self-healing/cucumber-report.json)
  --provider <name>      ${PROVIDER_NAMES.join(' | ')} (default SELF_HEAL_PROVIDER=${env.selfHeal.provider})
  --model <id>           model id for the model-backed providers (default SELF_HEAL_MODEL=${env.selfHeal.model})
  --live                 re-check candidate uniqueness on the live page (${env.ui.baseUrl})
  --apply                edit the page object, re-run the scenario, keep the fix only if it passes
  --out <dir>            where to write healing-report.md/.json and proposed-fixes.patch (default reports/self-healing)
  --max-failures <n>     only process the first n failures
  -h, --help             this text
`;

function parseOptions(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      report: { type: 'string' },
      provider: { type: 'string' },
      model: { type: 'string' },
      live: { type: 'boolean', default: false },
      apply: { type: 'boolean', default: false },
      out: { type: 'string' },
      'max-failures': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const provider = (values.provider ?? env.selfHeal.provider) as SelfHealProvider;
  if (!PROVIDER_NAMES.includes(provider))
    throw new Error(`--provider must be one of ${PROVIDER_NAMES.join(' | ')}, got "${provider}"`);
  const maxFailures =
    values['max-failures'] === undefined
      ? Number.POSITIVE_INFINITY
      : Number.parseInt(values['max-failures'], 10);
  if (!Number.isInteger(maxFailures) && maxFailures !== Number.POSITIVE_INFINITY)
    throw new Error('--max-failures must be an integer');
  return {
    help: values.help,
    reportPath: path.resolve(env.rootDir, values.report ?? 'reports/self-healing/cucumber-report.json'),
    outDir: path.resolve(env.rootDir, values.out ?? 'reports/self-healing'),
    provider,
    model: values.model ?? env.selfHeal.model,
    live: values.live,
    apply: values.apply,
    maxFailures,
  };
}

async function main(argv: string[]): Promise<number> {
  const options = parseOptions(argv);
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const snapshotsDir = path.dirname(options.reportPath);
  const failures = detectFailures(readCucumberReport(options.reportPath), env.rootDir);
  const selected = failures.slice(0, options.maxFailures);
  const locatorFailures = selected.filter((f) => f.failureClass !== 'not-a-locator-failure');
  console.log(
    `Detected ${failures.length} failed scenario(s) in ${path.relative(env.rootDir, options.reportPath)}; processing ${selected.length}, ${locatorFailures.length} classified as locator failures.`,
  );

  const { provider, reason } = resolveProvider(options.provider);
  console.log(
    `Provider: ${provider.name} (${reason}); model: ${options.model}; live: ${options.live}; apply: ${options.apply}`,
  );
  const validator = new Validator({ live: options.live, baseUrl: env.ui.baseUrl });
  const records: HealingRecord[] = [];
  try {
    for (const failure of selected) {
      const record: HealingRecord = {
        failure,
        provider: { name: provider.name, warnings: [] },
        candidates: [],
        notes: [],
      };
      records.push(record);
      const label = `[${records.length}/${selected.length}] ${failure.scenarioName}`;
      if (failure.failureClass === 'not-a-locator-failure') {
        record.notes.push(failure.classificationReason);
        console.log(`${label}: skipped (${failure.failureClass})`);
        continue;
      }
      const snapshots = loadSnapshots(snapshotsDir, failure.scenarioName);
      if (!snapshots.html) {
        record.notes.push(
          `no DOM snapshot at ${path.relative(env.rootDir, snapshots.htmlPath)}; re-run the suite so the After hook can capture it`,
        );
        console.log(`${label}: skipped (no DOM snapshot)`);
        continue;
      }
      const context = buildContext(snapshots.html, snapshots.aria, {
        stepText: failure.stepText,
        locator: failure.locator,
      });
      record.context = context.stats;
      console.log(
        `${label}: ${failure.failureClass}, locator ${failure.locator?.expression}; asking ${provider.name}...`,
      );
      try {
        const result = await provider.suggest({ failure, context, model: options.model });
        record.provider = {
          name: provider.name,
          model: result.model,
          usage: result.usage,
          warnings: result.warnings,
        };
        record.candidates = await validator.validate(failure, snapshots.html, result.candidates);
      } catch (error) {
        record.provider.error = (error as Error).message;
        console.error(`${label}: provider failed: ${record.provider.error}`);
        continue;
      }
      record.chosen = record.candidates.find((c) => c.ok);
      if (record.chosen) {
        const { fix, note } = buildFix(failure, record.chosen);
        record.fix = fix;
        if (note) record.notes.push(note);
      }
      const validated = record.candidates.filter((c) => c.ok).length;
      console.log(
        `${label}: ${record.candidates.length} candidate(s), ${validated} validated${record.chosen ? ` -> ${record.chosen.code}` : ''}`,
      );
    }
  } finally {
    await validator.close();
  }

  const meta: RunMeta = {
    generatedAt: new Date().toISOString(),
    rootDir: env.rootDir,
    reportPath: options.reportPath,
    provider: provider.name,
    providerReason: reason,
    model: options.model,
    live: options.live,
    apply: options.apply,
    command: `npm run heal -- ${argv.join(' ')}`.trim(),
  };
  const written = writeReports(records, meta, options.outDir);
  console.log(
    `Wrote ${[written.markdown, written.json, written.patch].map((f) => path.relative(env.rootDir, f)).join(', ')}`,
  );

  if (options.apply) {
    const logPath = path.join(options.outDir, 'apply-demo.log');
    const log: string[] = [`# ${meta.generatedAt} ${meta.command}`];
    const outcomes = applyFixes(records, {
      rootDir: env.rootDir,
      outDir: options.outDir,
      profile: 'selfHealing',
      log: (line) => {
        log.push(line);
        console.log(line);
      },
    });
    fs.writeFileSync(logPath, `${log.join('\n')}\n`);
    console.log(
      `Applied ${outcomes.filter((o) => o.kept).length} of ${outcomes.length} fix(es); log in ${path.relative(env.rootDir, logPath)}`,
    );
  }

  const healed = locatorFailures.filter((f) => records.find((r) => r.failure === f)?.chosen).length;
  console.log(`Validated candidates for ${healed} of ${locatorFailures.length} locator failure(s).`);
  return healed === locatorFailures.length ? 0 : 1;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error: Error) => {
    console.error(error.message);
    process.exit(2);
  });
