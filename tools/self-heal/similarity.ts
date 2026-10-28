/**
 * Lexical similarity helpers used to rank DOM elements against a broken locator and the step text.
 * Word-token overlap catches "loan amount" vs "Home Loan Amount"; character bigrams (Dice) catch
 * typos such as "#loanamountt" vs "loanamount" and compound ids such as "emiamount" vs "EMI amount".
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'given',
  'i',
  'in',
  'into',
  'is',
  'it',
  'my',
  'of',
  'on',
  'or',
  'should',
  'that',
  'the',
  'then',
  'this',
  'to',
  'when',
  'with',
]);

/** Selector syntax that carries no meaning about the target element. */
const SELECTOR_NOISE = new Set([
  'xpath',
  'css',
  'contains',
  'class',
  'id',
  'nth',
  'child',
  'of',
  'type',
  'text',
  'exact',
  'true',
  'false',
  'locator',
  'div',
  'span',
  'ul',
  'li',
  'a',
  'input',
  'and',
  'or',
  'not',
  'internal',
  'has',
]);

export function tokens(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token) && !STOP_WORDS.has(token));
}

export function selectorTokens(selector: string): string[] {
  return tokens(selector).filter((token) => !SELECTOR_NOISE.has(token));
}

function bigrams(text: string): Map<string, number> {
  const normalised = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const grams = new Map<string, number>();
  for (let i = 0; i < normalised.length - 1; i++) {
    const gram = normalised.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** Sørensen–Dice coefficient over character bigrams, in [0, 1]. */
export function dice(a: string, b: string): number {
  const gramsA = bigrams(a);
  const gramsB = bigrams(b);
  let totalA = 0;
  let totalB = 0;
  let shared = 0;
  for (const count of gramsA.values()) totalA += count;
  for (const count of gramsB.values()) totalB += count;
  if (totalA === 0 || totalB === 0) return 0;
  for (const [gram, count] of gramsA) shared += Math.min(count, gramsB.get(gram) ?? 0);
  return (2 * shared) / (totalA + totalB);
}

/** Dice coefficient over two token sets. */
export function tokenOverlap(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared++;
  return (2 * shared) / (setA.size + setB.size);
}

export interface WeightedField {
  readonly text: string | undefined;
  readonly weight: number;
}

/** Step wording that says what to do with an element, not which element it is. */
const STEP_NOISE = new Set([
  'box',
  'button',
  'check',
  'checkbox',
  'choose',
  'chooses',
  'click',
  'clicks',
  'contain',
  'contains',
  'displayed',
  'dropdown',
  'element',
  'enter',
  'enters',
  'field',
  'fields',
  'fill',
  'fills',
  'heading',
  'input',
  'into',
  'labeled',
  'labelled',
  'link',
  'open',
  'opens',
  'press',
  'presses',
  'radio',
  'read',
  'reads',
  'see',
  'sees',
  'select',
  'selects',
  'shown',
  'tab',
  'tabs',
  'type',
  'types',
  'visible',
]);

/** The tokens of a Gherkin step that describe the target element rather than the action. */
export function stepTokens(step: string): string[] {
  return tokens(step).filter((token) => !STEP_NOISE.has(token));
}

/** Two tokens are the same word when equal or within a typo of each other. */
const FUZZY_THRESHOLD = 0.8;

function sameWord(a: string, b: string): boolean {
  return a === b || (a.length >= 4 && b.length >= 4 && dice(a, b) >= FUZZY_THRESHOLD);
}

/**
 * How well one element field matches the query tokens: the F-measure of fuzzy precision (share of field
 * words the query explains) and fuzzy recall (share of query words the field explains). A single shared
 * word therefore scores low against a long field or a long query, while "Personal Loan" vs a query of
 * [personal, loan, ...] scores high. Compound ids are handled in both directions: the query token
 * "loanamountt" matches the field words "loan amount", and the field id "loanamount" matches a run of
 * query words "loan amount".
 */
export function fieldSimilarity(query: readonly string[], field: string): number {
  const fieldTokens = [...new Set(tokens(field))];
  const queryTokens = [...new Set(query)];
  if (fieldTokens.length === 0 || queryTokens.length === 0) return 0;
  const matchedField = new Set<number>();
  const matchedQuery = new Set<number>();
  queryTokens.forEach((q, qi) => {
    fieldTokens.forEach((f, fi) => {
      if (sameWord(q, f)) {
        matchedField.add(fi);
        matchedQuery.add(qi);
      }
    });
  });
  const joinedField = fieldTokens.join('');
  queryTokens.forEach((q, qi) => {
    if (matchedQuery.has(qi) || fieldTokens.length < 2 || q.length < 6) return;
    if (dice(q, joinedField) >= FUZZY_THRESHOLD) {
      matchedQuery.add(qi);
      fieldTokens.forEach((_, fi) => matchedField.add(fi));
    }
  });
  fieldTokens.forEach((f, fi) => {
    if (matchedField.has(fi) || f.length < 6) return;
    for (let start = 0; start < queryTokens.length - 1; start++) {
      for (let length = 2; length <= 3 && start + length <= queryTokens.length; length++) {
        if (dice(f, queryTokens.slice(start, start + length).join('')) < FUZZY_THRESHOLD) continue;
        matchedField.add(fi);
        for (let i = start; i < start + length; i++) matchedQuery.add(i);
      }
    }
  });
  if (matchedField.size === 0) return 0;
  const precision = matchedField.size / fieldTokens.length;
  const recall = matchedQuery.size / queryTokens.length;
  return (2 * precision * recall) / (precision + recall);
}

export function score(query: readonly string[], fields: readonly WeightedField[]): number {
  const scores = fields
    .filter((field): field is WeightedField & { text: string } => !!field.text)
    .map((field) => fieldSimilarity(query, field.text) * field.weight)
    .sort((x, y) => y - x);
  if (scores.length === 0) return 0;
  const supporting = scores.slice(1).filter((value) => value > 0.5).length;
  return Math.min(1, scores[0] + 0.1 * supporting);
}
