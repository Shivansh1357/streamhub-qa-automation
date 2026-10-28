import type { Action, Intent, ParsedLocator } from './types';

const ROLES_BY_ACTION: Record<Action, string[]> = {
  click: ['link', 'button', 'tab', 'menuitem', 'checkbox', 'radio', 'option', 'switch'],
  fill: ['textbox', 'searchbox', 'combobox', 'spinbutton'],
  check: ['checkbox', 'radio', 'switch'],
  select: ['combobox', 'listbox'],
  hover: [],
  assert: [],
  unknown: [],
};

const TAGS_BY_ACTION: Record<Action, string[]> = {
  click: ['a', 'button', 'input', 'li', 'label', 'summary'],
  fill: ['input', 'textarea'],
  check: ['input'],
  select: ['select'],
  hover: [],
  assert: [],
  unknown: [],
};

/** Words in a step that reveal what kind of element the author had in mind. */
const ROLE_HINTS: ReadonlyArray<readonly [RegExp, string[]]> = [
  [/\b(heading|title|header)\b/i, ['heading']],
  [/\b(tab|tabs)\b/i, ['link', 'tab']],
  [/\blink\b/i, ['link']],
  [/\bbutton\b/i, ['button']],
  [/\b(field|input|text ?box|box)\b/i, ['textbox', 'searchbox', 'spinbutton', 'combobox']],
  [/\bcheckbox\b/i, ['checkbox']],
  [/\b(radio|option)\b/i, ['radio', 'option']],
  [/\bdropdown\b/i, ['combobox', 'listbox']],
];

function actionFromApiCall(apiCall: string | undefined): Action {
  if (!apiCall) return 'unknown';
  const method = apiCall
    .replace(/^expect\(locator\)\./, 'expect.')
    .replace(/^locator\./, '')
    .replace(/\(\)$/, '');
  if (method.startsWith('expect.')) return 'assert';
  if (/^(click|dblclick|tap|press)$/.test(method)) return 'click';
  if (/^(fill|type|pressSequentially|clear)$/.test(method)) return 'fill';
  if (/^(check|uncheck|setChecked)$/.test(method)) return 'check';
  if (method === 'selectOption') return 'select';
  if (method === 'hover') return 'hover';
  return 'unknown';
}

/** The tag a CSS/XPath locator ends with, when it names one (e.g. "... > a" or "//input"). */
function tagFromLocator(locator: ParsedLocator | undefined): string | undefined {
  if (!locator) return undefined;
  if (locator.kind === 'xpath') {
    const tail = /\/\/?([a-z][a-z0-9]*)(?:\[[^\]]*\])?$/i.exec(locator.literal);
    return tail?.[1]?.toLowerCase();
  }
  if (locator.kind === 'css') {
    const last = locator.literal.split(/\s*[>+~]\s*|\s+/).pop() ?? '';
    const tail = /^([a-z][a-z0-9]*)(?:[#.:[]|$)/i.exec(last);
    return tail?.[1]?.toLowerCase();
  }
  return undefined;
}

export function inferIntent(
  stepText: string,
  apiCall: string | undefined,
  locator: ParsedLocator | undefined,
): Intent {
  const action = actionFromApiCall(apiCall);
  const hintedRoles = ROLE_HINTS.filter(([pattern]) => pattern.test(stepText)).flatMap(([, roles]) => roles);
  const locatorTag = tagFromLocator(locator);
  // The locator's own tag is the strongest evidence of what the author targeted; the step wording is next;
  // the action verb is the fallback (a click can be a link or a button, a fill is always an input).
  const expectedTags = locatorTag ? [locatorTag] : TAGS_BY_ACTION[action];
  const expectedRoles = hintedRoles.length > 0 ? [...new Set(hintedRoles)] : ROLES_BY_ACTION[action];
  const summaryParts = [`action=${action}`];
  if (expectedRoles.length > 0) summaryParts.push(`roles=${expectedRoles.join('|')}`);
  if (expectedTags.length > 0) summaryParts.push(`tags=${expectedTags.join('|')}`);
  return { action, expectedTags, expectedRoles, summary: summaryParts.join(', ') };
}

/** An element is compatible when it matches either constraint; both empty means anything goes. */
export function isCompatible(intent: Intent, tag: string, role: string | undefined): boolean {
  if (intent.expectedTags.length === 0 && intent.expectedRoles.length === 0) return true;
  if (intent.expectedTags.includes(tag)) return true;
  return role !== undefined && intent.expectedRoles.includes(role);
}
