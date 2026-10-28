/** Shared data model for the self-healing pipeline: detect -> context -> suggest -> validate -> patch -> report. */

export type FailureClass = 'locator-not-found' | 'wrong-element' | 'ambiguous' | 'not-a-locator-failure';

export type LocatorKind = 'css' | 'xpath' | 'text' | 'role' | 'label' | 'testid' | 'placeholder' | 'other';

export interface ParsedLocator {
  /** The locator exactly as Playwright printed it, e.g. getByText('Loan EMI Amount', { exact: true }). */
  expression: string;
  kind: LocatorKind;
  /** The first string literal inside the expression: the selector, text or name. */
  literal: string;
}

export interface SourceLocation {
  /** Path relative to the repo root. */
  file: string;
  /** 1-based line number. */
  line: number;
  lineText: string;
  /** Whether the whole expression matched (exact) or only its literal (fuzzy). */
  match: 'expression' | 'literal';
}

export type Action = 'click' | 'fill' | 'check' | 'select' | 'hover' | 'assert' | 'unknown';

export interface Intent {
  action: Action;
  /** Tags the healed element may have; empty means "no constraint". */
  expectedTags: string[];
  /** ARIA roles the healed element may have; empty means "no constraint". */
  expectedRoles: string[];
  summary: string;
}

export interface DetectedFailure {
  featureName: string;
  featureUri: string;
  scenarioName: string;
  scenarioLine: number;
  stepKeyword: string;
  stepText: string;
  stepLine: number;
  stepDefinition?: string;
  errorMessage: string;
  /** The first lines of the error, enough for a human and a model to understand what Playwright saw. */
  errorExcerpt: string;
  /** The Playwright call that failed, e.g. locator.click or expect(locator).toBeVisible(). */
  apiCall?: string;
  locator?: ParsedLocator;
  resolvedCount?: number;
  failureClass: FailureClass;
  classificationReason: string;
  intent: Intent;
  source?: SourceLocation;
  /** Every page-object line that matched; more than one means the mapping needs a human. */
  sourceCandidates: SourceLocation[];
}

export interface ElementSummary {
  tag: string;
  id?: string;
  classes: string[];
  name?: string;
  type?: string;
  role?: string;
  accessibleName?: string;
  labelText?: string;
  text?: string;
  placeholder?: string;
  testId?: string;
  containerId?: string;
  /** A readable ancestor chain, e.g. div#emiamount > h4. */
  path: string;
  /** True when the markup itself says the element is hidden (type=hidden, hidden, display:none, aria-hidden). */
  hiddenHint: boolean;
  /** Lexical similarity to the broken locator + step text, in [0, 1]. */
  score: number;
}
