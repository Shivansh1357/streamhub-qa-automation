import fs from 'node:fs';
import path from 'node:path';
import { inferIntent } from './intent';
import type { DetectedFailure, FailureClass, LocatorKind, ParsedLocator, SourceLocation } from './types';

/** The subset of the Cucumber JSON report the detector relies on. */
interface CucumberStep {
  keyword: string;
  name?: string;
  line?: number;
  hidden?: boolean;
  match?: { location?: string };
  result?: { status: string; error_message?: string };
}

interface CucumberScenario {
  name: string;
  line: number;
  type?: string;
  steps?: CucumberStep[];
}

interface CucumberFeature {
  uri: string;
  name: string;
  elements?: CucumberScenario[];
}

export function readCucumberReport(reportPath: string): CucumberFeature[] {
  const raw: unknown = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (!Array.isArray(raw))
    throw new Error(`${reportPath} is not a Cucumber JSON report (expected an array of features)`);
  return raw as CucumberFeature[];
}

export interface ParsedError {
  apiCall?: string;
  locator?: ParsedLocator;
  resolvedCount?: number;
}

function firstStringLiteral(expression: string): string | undefined {
  const match = /(['"`])((?:\\.|(?!\1).)*)\1/.exec(expression);
  return match ? match[2].replace(/\\(['"`\\])/g, '$1') : undefined;
}

function kindOf(expression: string, literal: string): LocatorKind {
  const method = /^(?:locator|getBy[A-Za-z]+)/.exec(expression.trim())?.[0];
  switch (method) {
    case 'getByText':
      return 'text';
    case 'getByRole':
      return 'role';
    case 'getByLabel':
      return 'label';
    case 'getByTestId':
      return 'testid';
    case 'getByPlaceholder':
      return 'placeholder';
    case 'locator':
      return literal.startsWith('xpath=') || literal.startsWith('//') || literal.startsWith('(//')
        ? 'xpath'
        : 'css';
    default:
      return 'other';
  }
}

/**
 * Pulls the locator out of a Playwright error. Three message shapes cover every locator failure:
 *   strict mode violation: locator('...') resolved to N elements
 *   Locator: getByText('...')              (expect(locator) failures)
 *   - waiting for locator('...')           (action timeouts, in the call log)
 */
/** Cucumber keeps Playwright's ANSI colour codes (e.g. the dimmed call log) in error_message. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

export function parseLocatorFromError(rawMessage: string): ParsedError {
  const message = stripAnsi(rawMessage);
  const apiCall = /(?:^|\n)(?:Error: )?(locator\.[a-zA-Z]+|expect\(locator\)\.[a-zA-Z]+\(\))/.exec(
    message,
  )?.[1];
  const strict = /strict mode violation: (.+?) resolved to (\d+) elements/.exec(message);
  const expression =
    strict?.[1] ?? /^Locator: (.+)$/m.exec(message)?.[1] ?? /^\s*- waiting for (.+)$/m.exec(message)?.[1];
  if (!expression) return { apiCall };
  const trimmed = expression.trim();
  const literal = firstStringLiteral(trimmed);
  if (literal === undefined) return { apiCall };
  return {
    apiCall,
    locator: { expression: trimmed, kind: kindOf(trimmed, literal), literal },
    resolvedCount: strict ? Number.parseInt(strict[2], 10) : undefined,
  };
}

export function classifyFailure(
  parsed: ParsedError,
  rawMessage: string,
): { failureClass: FailureClass; reason: string } {
  const message = stripAnsi(rawMessage);
  if (!parsed.locator) {
    return {
      failureClass: 'not-a-locator-failure',
      reason:
        'No Playwright locator appears in the error, so this is an assertion, navigation or runtime error.',
    };
  }
  if (parsed.resolvedCount !== undefined) {
    return {
      failureClass: 'ambiguous',
      reason: `Strict mode violation: the locator resolved to ${parsed.resolvedCount} elements, so it is not specific enough.`,
    };
  }
  if (/Received: <element\(s\) not found>|^Error: element\(s\) not found$/m.test(message)) {
    return { failureClass: 'locator-not-found', reason: 'The expectation found no element for the locator.' };
  }
  if (
    /is not an? <(input|select|textarea)|cannot be filled|Not a checkbox or radio|Element is not a <select>/i.test(
      message,
    )
  ) {
    return {
      failureClass: 'wrong-element',
      reason: 'The locator resolved to an element that cannot perform the action.',
    };
  }
  const resolvedLine = /^\s*- locator resolved to (.+)$/m.exec(message);
  if (resolvedLine) {
    const obstacle = /^\s*- (element is not (?:visible|enabled|editable|attached|stable)[^\n]*)$/m.exec(
      message,
    )?.[1];
    return {
      failureClass: 'wrong-element',
      reason: `The locator resolved to ${resolvedLine[1].trim().slice(0, 120)} but the action never completed${obstacle ? ` (${obstacle})` : ''}.`,
    };
  }
  if (/Timeout \d+ms exceeded/.test(message) || /Expected: visible/.test(message)) {
    return {
      failureClass: 'locator-not-found',
      reason: 'Playwright waited for the locator and it never resolved to an element.',
    };
  }
  if (/^Error: expect\(locator\)\./m.test(message) && /^Received:/m.test(message)) {
    return {
      failureClass: 'not-a-locator-failure',
      reason:
        'The element was found but its state differed from the expectation: likely a product or test-data issue, not a locator.',
    };
  }
  return {
    failureClass: 'locator-not-found',
    reason: 'A locator is mentioned in the error but no element was ever resolved.',
  };
}

function listTypeScriptFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

/** Maps a locator to the page-object line(s) that declare it, preferring whole-expression matches over literal ones. */
export function findSource(
  locator: ParsedLocator,
  rootDir: string,
  pagesDir = 'tests/pages',
): SourceLocation[] {
  const found: SourceLocation[] = [];
  for (const file of listTypeScriptFiles(path.join(rootDir, pagesDir))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((lineText, index) => {
      const match = lineText.includes(locator.expression)
        ? 'expression'
        : lineText.includes(locator.literal)
          ? 'literal'
          : undefined;
      if (match) {
        found.push({
          file: path.relative(rootDir, file).split(path.sep).join('/'),
          line: index + 1,
          lineText,
          match,
        });
      }
    });
  }
  return found.sort((a, b) => (a.match === b.match ? 0 : a.match === 'expression' ? -1 : 1));
}

export function errorExcerpt(message: string, maxChars = 1200): string {
  const withoutStack = stripAnsi(message)
    .split('\n')
    .filter((line) => !/^\s+at .+:\d+:\d+\)?$/.test(line))
    .join('\n')
    .trim();
  return withoutStack.length > maxChars ? `${withoutStack.slice(0, maxChars)}\n…` : withoutStack;
}

export function detectFailures(report: CucumberFeature[], rootDir: string): DetectedFailure[] {
  const failures: DetectedFailure[] = [];
  for (const feature of report) {
    for (const scenario of feature.elements ?? []) {
      if (scenario.type && scenario.type !== 'scenario') continue;
      const failedStep = (scenario.steps ?? []).find((step) => step.result?.status === 'failed');
      if (!failedStep) continue;
      const message = failedStep.result?.error_message ?? '';
      const parsed = parseLocatorFromError(message);
      const { failureClass, reason } = classifyFailure(parsed, message);
      const sourceCandidates = parsed.locator ? findSource(parsed.locator, rootDir) : [];
      const stepText = failedStep.name ?? `${failedStep.keyword.trim()} hook`;
      failures.push({
        featureName: feature.name,
        featureUri: feature.uri,
        scenarioName: scenario.name,
        scenarioLine: scenario.line,
        stepKeyword: failedStep.keyword.trim(),
        stepText,
        stepLine: failedStep.line ?? 0,
        stepDefinition: failedStep.match?.location,
        errorMessage: message,
        errorExcerpt: errorExcerpt(message),
        apiCall: parsed.apiCall,
        locator: parsed.locator,
        resolvedCount: parsed.resolvedCount,
        failureClass,
        classificationReason: reason,
        intent: inferIntent(stepText, parsed.apiCall, parsed.locator),
        source: sourceCandidates[0],
        sourceCandidates,
      });
    }
  }
  return failures;
}
