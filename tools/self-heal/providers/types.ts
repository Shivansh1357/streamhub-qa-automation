/**
 * The contract every suggestion backend implements. A provider only proposes candidates; it never
 * touches the browser or the source tree. Validation (validate.ts) decides what is trustworthy.
 */
import type { HealingContext } from '../context';
import type { DetectedFailure } from '../types';

/** Ordered by the project locator policy: role > label > text > test id > stable id / css. */
export const STRATEGIES = ['role', 'label', 'text', 'testid', 'placeholder', 'css'] as const;

export type Strategy = (typeof STRATEGIES)[number];

export interface Candidate {
  strategy: Strategy;
  /** ARIA role for the 'role' strategy, e.g. link, textbox, heading. */
  role?: string;
  /** Accessible name for the 'role' strategy (mirrors `value`). */
  name?: string;
  /** Whether the name / label / text must match exactly (Playwright `exact: true`). */
  exact?: boolean;
  /** The primary argument: accessible name (role), label text, visible text, test id, placeholder or CSS selector. */
  value: string;
  rationale: string;
  /** The provider's own confidence in [0, 1]; validation may still reject the candidate. */
  confidence: number;
}

export interface ProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  durationMs?: number;
}

export interface ProviderResult {
  candidates: Candidate[];
  /** The model that actually answered (providers may fall back or report a different id). */
  model?: string;
  usage?: ProviderUsage;
  /** Anything the reviewer should know: parse problems, dropped candidates, truncation. */
  warnings: string[];
}

export interface HealingInput {
  failure: DetectedFailure;
  context: HealingContext;
  model: string;
}

export interface LocatorProvider {
  readonly name: string;
  suggest(input: HealingInput): Promise<ProviderResult>;
}

/** Strategy rank for sorting: lower is preferred by the locator policy. */
export function strategyRank(strategy: Strategy): number {
  return STRATEGIES.indexOf(strategy);
}
