/**
 * Deterministic fallback that needs no model: ranks the elements of the trimmed DOM against the broken
 * locator and the step text, keeps only those compatible with the inferred intent, and emits candidates
 * in locator-policy order. It is also the baseline the model-backed providers are compared against.
 */
import { isCompatible } from '../intent';
import { ARIA_ROLES } from '../roles';
import { dice } from '../similarity';
import type { ElementSummary, ParsedLocator } from '../types';
import type { Candidate, HealingInput, LocatorProvider, ProviderResult, Strategy } from './types';

const STRATEGY_WEIGHT: Record<Strategy, number> = {
  role: 1,
  label: 0.95,
  testid: 0.9,
  text: 0.85,
  placeholder: 0.8,
  css: 0.75,
};
const MIN_ELEMENT_SCORE = 0.3;
/** Elements scoring below this share of the best match are noise once a strong match exists. */
const RELATIVE_CUTOFF = 0.6;
const MAX_ELEMENTS = 4;
const MAX_CANDIDATES = 6;
const CONTROL_TAGS = new Set(['input', 'select', 'textarea', 'button']);

interface RankedElement {
  element: ElementSummary;
  score: number;
  reasons: string[];
}

function quotedPhrases(step: string): string[] {
  return [...step.matchAll(/"([^"]+)"/g)].map((match) => match[1].trim().toLowerCase()).filter(Boolean);
}

/** The id a broken CSS locator names, e.g. '#loanamountt' -> loanamountt. */
function idFromLocator(locator: ParsedLocator | undefined): string | undefined {
  if (!locator || locator.kind !== 'css') return undefined;
  return /^#([A-Za-z][\w-]*)$/.exec(locator.literal.trim())?.[1];
}

/** Human-readable ids without long digit runs; menu-item-2696 is generated, loanamount is not. */
function isStableId(id: string): boolean {
  return /^[A-Za-z][\w-]{0,39}$/.test(id) && !/\d{3,}/.test(id);
}

function rankElements(input: HealingInput): RankedElement[] {
  const { failure, context } = input;
  const phrases = quotedPhrases(failure.stepText);
  const brokenId = idFromLocator(failure.locator);
  const ranked: RankedElement[] = [];
  for (const element of context.elements) {
    if (!isCompatible(failure.intent, element.tag, element.role)) continue;
    const reasons: string[] = [];
    // context.ts already scored every element against the same step + locator tokens.
    let value = element.score;
    if (value > 0) reasons.push(`lexical match ${value.toFixed(2)} to the step and the broken locator`);
    const names = [element.accessibleName, element.labelText, element.text]
      .filter((n): n is string => !!n)
      .map((n) => n.toLowerCase());
    const phrase = phrases.find((p) => names.includes(p));
    if (phrase) {
      value += 0.35;
      reasons.push(`its name equals "${phrase}", quoted in the step`);
    }
    if (brokenId && element.id && element.id !== brokenId && dice(brokenId, element.id) >= 0.8) {
      value += 0.3;
      reasons.push(`id "${element.id}" is within a typo of "${brokenId}"`);
    }
    if (element.hiddenHint) {
      value *= 0.5;
      reasons.push('the markup hints it is hidden');
    }
    value = Math.min(1, value);
    if (value < MIN_ELEMENT_SCORE) continue;
    ranked.push({ element, score: value, reasons });
  }
  ranked.sort((a, b) => b.score - a.score);
  const cutoff = (ranked[0]?.score ?? 0) * RELATIVE_CUTOFF;
  return ranked.filter((entry) => entry.score >= cutoff).slice(0, MAX_ELEMENTS);
}

function candidatesFor({ element, score, reasons }: RankedElement): Candidate[] {
  const out: Candidate[] = [];
  const why = `Matched <${element.path}> (score ${score.toFixed(2)}): ${reasons.join('; ')}.`;
  const push = (candidate: Omit<Candidate, 'rationale' | 'confidence'>, note: string): void => {
    out.push({
      ...candidate,
      rationale: `${note} ${why}`,
      confidence: Number((score * STRATEGY_WEIGHT[candidate.strategy]).toFixed(2)),
    });
  };
  const isControl = CONTROL_TAGS.has(element.tag);
  if (element.role && ARIA_ROLES.has(element.role) && element.accessibleName) {
    push(
      {
        strategy: 'role',
        role: element.role,
        name: element.accessibleName,
        exact: true,
        value: element.accessibleName,
      },
      `getByRole keeps the ${element.role} role the step relies on.`,
    );
  }
  if (element.labelText)
    push({ strategy: 'label', value: element.labelText, exact: true }, 'The control has a visible <label>.');
  if (element.testId) push({ strategy: 'testid', value: element.testId }, 'The element exposes a test id.');
  if (!isControl && element.text && element.text.length <= 80 && element.text === element.accessibleName) {
    push(
      { strategy: 'text', value: element.text, exact: true },
      'The element is static text the user reads.',
    );
  }
  if (element.placeholder && !element.labelText)
    push(
      { strategy: 'placeholder', value: element.placeholder },
      'The control has no label, only a placeholder.',
    );
  if (element.id && isStableId(element.id))
    push({ strategy: 'css', value: `#${element.id}` }, 'Its id is short, human-readable and not generated.');
  else if (isControl && element.name)
    push(
      { strategy: 'css', value: `${element.tag}[name="${element.name}"]` },
      'Its name attribute is the form field name.',
    );
  return out;
}

export class OfflineProvider implements LocatorProvider {
  readonly name = 'offline';

  async suggest(input: HealingInput): Promise<ProviderResult> {
    const started = Date.now();
    const warnings: string[] = [];
    const ranked = rankElements(input);
    if (ranked.length === 0) {
      warnings.push(
        `No element compatible with the intent (${input.failure.intent.summary}) scored above ${MIN_ELEMENT_SCORE} against the step and locator tokens.`,
      );
    }
    const seen = new Set<string>();
    const candidates = ranked
      .flatMap(candidatesFor)
      .filter((candidate) => {
        const key = `${candidate.strategy}|${candidate.role ?? ''}|${candidate.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_CANDIDATES);
    return {
      candidates,
      model: 'heuristic (no model)',
      usage: { durationMs: Date.now() - started },
      warnings,
    };
  }
}
