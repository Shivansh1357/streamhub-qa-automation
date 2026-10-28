/**
 * Validation before anything is applied. A candidate is trusted only when it resolves to exactly one
 * element in the DOM saved at failure time AND that element is the kind of element the step intended.
 * With --live the uniqueness check is repeated against the real page. Visibility is reported but never
 * decides: a snapshot loaded with page.setContent() has none of the site's CSS.
 */
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { stripScripts } from './html';
import { isCompatible } from './intent';
import { strategyRank, type Candidate } from './providers/types';
import { ARIA_ROLES, implicitRole } from './roles';
import type { DetectedFailure } from './types';

export interface SnapshotCheck {
  matches: number;
  tag?: string;
  role?: string;
  compatible?: boolean;
  /** Advisory only (no site CSS in the snapshot). */
  visible?: boolean;
}

export interface LiveCheck {
  matches: number;
  visible?: boolean;
  error?: string;
}

export interface ValidationResult {
  candidate: Candidate;
  /** Page-object code for the candidate, e.g. this.page.getByLabel('Interest Rate', { exact: true }). */
  code: string;
  snapshot: SnapshotCheck;
  live?: LiveCheck;
  /** Unique in the snapshot, compatible with the intent and (when checked) unique on the live page. */
  ok: boolean;
  notes: string[];
}

type AriaRole = Parameters<Page['getByRole']>[0];

/** Builds the locator from structured fields only: no string evaluation, so a candidate can never run code. */
export function buildLocator(page: Page, candidate: Candidate): Locator {
  const exact = candidate.exact ?? true;
  switch (candidate.strategy) {
    case 'role': {
      const role = candidate.role as AriaRole;
      const name = candidate.name ?? candidate.value;
      return name ? page.getByRole(role, { name, exact }) : page.getByRole(role);
    }
    case 'label':
      return page.getByLabel(candidate.value, { exact });
    case 'text':
      return page.getByText(candidate.value, { exact });
    case 'testid':
      return page.getByTestId(candidate.value);
    case 'placeholder':
      return page.getByPlaceholder(candidate.value, { exact });
    case 'css':
      return page.locator(candidate.value);
  }
}

/** Single-quoted TypeScript string literal; model-supplied text is escaped so it can never break out of the literal. */
function quote(text: string): string {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `'${escaped}'`;
}

/** The locator as it should appear in the page object; `receiver` is prepended when given (this.page). */
export function toPlaywrightCode(candidate: Candidate, receiver?: string): string {
  const prefix = receiver ? `${receiver}.` : '';
  const exact = candidate.exact ?? true;
  const exactOption = exact ? ', { exact: true }' : '';
  switch (candidate.strategy) {
    case 'role': {
      const name = candidate.name ?? candidate.value;
      const options = name ? `, { name: ${quote(name)}${exact ? ', exact: true' : ''} }` : '';
      return `${prefix}getByRole(${quote(candidate.role ?? '')}${options})`;
    }
    case 'label':
      return `${prefix}getByLabel(${quote(candidate.value)}${exactOption})`;
    case 'text':
      return `${prefix}getByText(${quote(candidate.value)}${exactOption})`;
    case 'testid':
      return `${prefix}getByTestId(${quote(candidate.value)})`;
    case 'placeholder':
      return `${prefix}getByPlaceholder(${quote(candidate.value)}${exactOption})`;
    case 'css':
      return `${prefix}locator(${quote(candidate.value)})`;
  }
}

export interface ValidatorOptions {
  live: boolean;
  baseUrl?: string;
}

/** Ranks validated candidates first, then by locator policy, then by the provider's confidence. */
export function rankResults(results: ValidationResult[]): ValidationResult[] {
  return [...results].sort(
    (a, b) =>
      Number(b.ok) - Number(a.ok) ||
      strategyRank(a.candidate.strategy) - strategyRank(b.candidate.strategy) ||
      b.candidate.confidence - a.candidate.confidence,
  );
}

export class Validator {
  private browser?: Browser;
  private liveContext?: BrowserContext;
  private livePage?: Page;
  private liveError?: string;

  constructor(private readonly options: ValidatorOptions) {}

  async validate(
    failure: DetectedFailure,
    html: string,
    candidates: Candidate[],
  ): Promise<ValidationResult[]> {
    if (candidates.length === 0) return [];
    const browser = await this.getBrowser();
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    try {
      const page = await context.newPage();
      await page.route('**/*', (route) => route.abort());
      await page.setContent(stripScripts(html), { waitUntil: 'domcontentloaded' });
      const results: ValidationResult[] = [];
      for (const candidate of candidates) results.push(await this.checkSnapshot(page, failure, candidate));
      if (this.options.live) for (const result of results) await this.checkLive(result);
      return rankResults(results);
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    await this.liveContext?.close();
    await this.browser?.close();
    this.liveContext = undefined;
    this.livePage = undefined;
    this.browser = undefined;
  }

  private async getBrowser(): Promise<Browser> {
    this.browser ??= await chromium.launch({ headless: true });
    return this.browser;
  }

  private async checkSnapshot(
    page: Page,
    failure: DetectedFailure,
    candidate: Candidate,
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      candidate,
      code: toPlaywrightCode(candidate, 'this.page'),
      snapshot: { matches: 0 },
      ok: false,
      notes: [],
    };
    if (candidate.strategy === 'role' && !ARIA_ROLES.has(candidate.role ?? '')) {
      result.notes.push(`"${candidate.role}" is not an ARIA role Playwright accepts`);
      return result;
    }
    let locator: Locator;
    try {
      locator = buildLocator(page, candidate);
      result.snapshot.matches = await locator.count();
    } catch (error) {
      result.notes.push(`invalid locator: ${(error as Error).message.split('\n')[0]}`);
      return result;
    }
    if (result.snapshot.matches !== 1) {
      result.notes.push(
        result.snapshot.matches === 0
          ? 'matches nothing in the saved DOM'
          : `matches ${result.snapshot.matches} elements in the saved DOM (must be exactly 1)`,
      );
      return result;
    }
    const info = await locator.evaluate((element) => ({
      tag: element.tagName.toLowerCase(),
      attrs: Object.fromEntries(Array.from(element.attributes).map((attr) => [attr.name, attr.value])),
    }));
    result.snapshot.tag = info.tag;
    result.snapshot.role = implicitRole(info.tag, info.attrs);
    result.snapshot.compatible = isCompatible(failure.intent, info.tag, result.snapshot.role);
    if (!result.snapshot.compatible) {
      result.notes.push(
        `resolves to <${info.tag}>${result.snapshot.role ? ` (role ${result.snapshot.role})` : ''} but the step needs ${failure.intent.summary}`,
      );
    }
    result.snapshot.visible = await locator.isVisible();
    if (!result.snapshot.visible)
      result.notes.push('not visible in the snapshot (advisory: the snapshot has no site CSS)');
    result.ok = result.snapshot.compatible;
    return result;
  }

  private async getLivePage(): Promise<Page> {
    if (this.livePage) return this.livePage;
    if (!this.options.baseUrl) throw new Error('no base URL configured for the live check');
    const browser = await this.getBrowser();
    this.liveContext = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'en-IN' });
    const page = await this.liveContext.newPage();
    await page.goto(this.options.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    this.livePage = page;
    return page;
  }

  /** Repeats the uniqueness check on the real page; only candidates that passed the snapshot are worth the round trip. */
  private async checkLive(result: ValidationResult): Promise<void> {
    if (result.snapshot.matches !== 1) return;
    if (this.liveError) {
      result.live = { matches: -1, error: this.liveError };
      result.notes.push(`live check skipped: ${this.liveError}`);
      return;
    }
    try {
      const page = await this.getLivePage();
      const locator = buildLocator(page, result.candidate);
      const matches = await locator.count();
      result.live = { matches, visible: matches === 1 ? await locator.isVisible() : undefined };
      if (matches !== 1) {
        result.ok = false;
        result.notes.push(
          matches === 0 ? 'matches nothing on the live page' : `matches ${matches} elements on the live page`,
        );
      } else if (!result.live.visible) {
        result.notes.push('not visible on the live page');
      }
    } catch (error) {
      this.liveError = (error as Error).message.split('\n')[0];
      result.live = { matches: -1, error: this.liveError };
      result.notes.push(`live check skipped: ${this.liveError}`);
    }
  }
}
