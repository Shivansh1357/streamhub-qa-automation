/**
 * The prompt and the JSON contract shared by the model-backed providers (Anthropic SDK and Claude Code CLI).
 * The offline provider does not use the prompt but validates against the same schema so every backend
 * produces identical candidate objects.
 */
import { z } from 'zod';
import { STRATEGIES, type Candidate, type HealingInput } from './types';

export const LOCATOR_POLICY = `Locator policy, in order of preference:
1. getByRole(role, { name, exact: true }) - the accessible role and name the user perceives.
2. getByLabel(text, { exact: true }) - for form controls with a <label> or aria-label.
3. getByText(text, { exact: true }) - for static text that is itself the target (headings, cells).
4. getByTestId(id) - when the page exposes data-testid / data-test / data-qa attributes.
5. getByPlaceholder(text) - only when the control has no label.
6. css - a stable id (#loanamount) or a short attribute selector ([name="loanamount"]).
Never propose positional selectors (nth-child, nth-of-type, XPath indexes, chains of unnamed divs),
auto-generated ids, or class names that describe layout rather than meaning.`;

export const SYSTEM_PROMPT = `You repair broken Playwright locators in a TypeScript page object for an end-to-end test suite.
You are given the failing Cucumber step, the locator that failed, Playwright's error, a trimmed copy of the
DOM captured at the moment of failure and an excerpt of the accessibility tree. Find the element the step
author meant and propose the most robust locators for it.

${LOCATOR_POLICY}

Rules:
- The healed element must be the same kind of element the test intended: a fill targets a text input,
  a click on a tab targets the link or tab, a heading assertion targets a heading.
- Prefer names that will not change with page state (a label that changes with the selected product is
  weaker than a stable id).
- Every candidate must match exactly one element in the DOM you were given.
- Propose at most 5 candidates, best first, each with a one-sentence rationale and a confidence in [0, 1].
- Answer with ONLY a JSON object of the form {"candidates": [...]}: no prose, no markdown fences.`;

const strategyList = STRATEGIES.map((s) => `"${s}"`).join(' | ');

export const RESPONSE_SHAPE = `{"candidates": [{"strategy": ${strategyList}, "role": "aria role (role strategy only)", "name": "accessible name (role strategy only)", "exact": true, "value": "accessible name | label | text | test id | placeholder | css selector", "rationale": "one sentence", "confidence": 0.0-1.0}]}`;

export const CandidateSchema = z.object({
  strategy: z.enum(STRATEGIES),
  role: z.string().optional(),
  name: z.string().optional(),
  exact: z.boolean().optional(),
  value: z.string(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});

export const CandidatesSchema = z.object({ candidates: z.array(CandidateSchema).max(5) });

export type CandidatesPayload = z.infer<typeof CandidatesSchema>;

export function buildUserPrompt(input: HealingInput): string {
  const { failure, context } = input;
  const locator = failure.locator;
  const sections = [
    `## Failing step\nFeature: ${failure.featureName}\nScenario: ${failure.scenarioName}\nStep: ${failure.stepKeyword} ${failure.stepText}`,
    `## Original locator\n${locator?.expression ?? '(none parsed)'}\nKind: ${locator?.kind ?? 'unknown'}\nPlaywright call: ${failure.apiCall ?? 'unknown'}\nDeclared at: ${failure.source ? `${failure.source.file}:${failure.source.line}` : 'unknown'}`,
    `## Error class\n${failure.failureClass}: ${failure.classificationReason}\nInferred intent: ${failure.intent.summary}\n\n### Playwright error (trimmed)\n${failure.errorExcerpt}`,
    `## Trimmed DOM at failure (noise removed, ${context.stats.trimmedChars} of ${context.stats.originalChars} chars)\n${context.trimmedDom}`,
    context.ariaExcerpt
      ? `## Accessibility tree excerpt (Playwright aria snapshot)\n${context.ariaExcerpt}`
      : '',
    `## Answer format\nRespond with ONLY this JSON object and nothing else:\n${RESPONSE_SHAPE}`,
  ];
  return sections.filter(Boolean).join('\n\n');
}

/** Returns the first balanced {...} object in free text, skipping braces inside JSON strings. */
export function extractFirstJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

/** Fills the mirrored role fields, clamps confidence and drops candidates that cannot be built. */
export function normaliseCandidates(payload: CandidatesPayload, warnings: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const raw of payload.candidates) {
    const candidate: Candidate = { ...raw, confidence: Math.min(1, Math.max(0, raw.confidence)) };
    // The prompt asks for exact matching; treat a missing flag as exact so validation and the patch agree.
    if (candidate.strategy !== 'css' && candidate.strategy !== 'testid') candidate.exact ??= true;
    else delete candidate.exact;
    if (candidate.strategy === 'role') {
      candidate.role = candidate.role?.trim().toLowerCase();
      candidate.name = candidate.name?.trim() || candidate.value.trim() || undefined;
      candidate.value = candidate.name ?? '';
      if (!candidate.role) {
        warnings.push(`Dropped a role candidate without a role: ${JSON.stringify(raw)}`);
        continue;
      }
    } else {
      delete candidate.role;
      delete candidate.name;
    }
    if (!candidate.value && !(candidate.strategy === 'role' && candidate.role)) {
      warnings.push(`Dropped a ${candidate.strategy} candidate with an empty value`);
      continue;
    }
    out.push(candidate);
  }
  return out;
}

/** Parses free-form model output into candidates; a parse failure yields zero candidates plus a warning. */
export function parseCandidatesFromText(text: string): { candidates: Candidate[]; warnings: string[] } {
  const warnings: string[] = [];
  const json = extractFirstJsonObject(text);
  if (!json) {
    warnings.push(`No JSON object found in the model output (${text.length} chars)`);
    return { candidates: [], warnings };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    warnings.push(`Model output is not valid JSON: ${(error as Error).message}`);
    return { candidates: [], warnings };
  }
  const result = CandidatesSchema.safeParse(parsed);
  if (!result.success) {
    warnings.push(
      `Model output did not match the candidate schema: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
    return { candidates: [], warnings };
  }
  return { candidates: normaliseCandidates(result.data, warnings), warnings };
}
