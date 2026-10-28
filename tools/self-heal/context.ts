import fs from 'node:fs';
import path from 'node:path';
import { slugify } from '../../tests/support/artifacts';
import { HtmlElement, ancestors, collapseWhitespace, parseHtml, textContent, walk } from './html';
import { implicitRole } from './roles';
import { score, selectorTokens, stepTokens, tokenOverlap, tokens } from './similarity';
import type { ElementSummary, ParsedLocator } from './types';

export interface SnapshotFiles {
  htmlPath: string;
  ariaPath: string;
  html?: string;
  aria?: string;
}

/** The After hook in tests/support/hooks.ts names snapshots after the scenario slug; we must derive the same name. */
export function loadSnapshots(outDir: string, scenarioName: string): SnapshotFiles {
  const slug = slugify(scenarioName);
  const htmlPath = path.join(outDir, 'dom-snapshots', `${slug}.html`);
  const ariaPath = path.join(outDir, 'dom-snapshots', `${slug}.aria.yml`);
  return {
    htmlPath,
    ariaPath,
    html: fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : undefined,
    aria: fs.existsSync(ariaPath) ? fs.readFileSync(ariaPath, 'utf8') : undefined,
  };
}

export interface ContextQuery {
  stepText: string;
  locator?: ParsedLocator;
}

export interface ContextBudget {
  domChars: number;
  ariaChars: number;
}

export interface HealingContext {
  trimmedDom: string;
  ariaExcerpt: string;
  elements: ElementSummary[];
  stats: { originalChars: number; trimmedChars: number; elements: number; containers: number };
}

export const DEFAULT_BUDGET: ContextBudget = { domChars: 25_000, ariaChars: 4_000 };

const DROP_TAGS = new Set([
  'script',
  'style',
  'svg',
  'iframe',
  'noscript',
  'template',
  'canvas',
  'object',
  'embed',
  'video',
  'audio',
  'picture',
  'source',
  'link',
  'meta',
  'head',
  'img',
]);

const AD_TOKEN =
  /^(ads?|adverts?|advertisement|adsbygoogle|adslot.*|adsense.*|google-anno.*|goog-.*|ad-.*|.*-ads?|sponsored.*)$/i;

const CONTROL_TAGS = new Set(['input', 'select', 'textarea', 'button']);
const LANDMARK_TAGS = new Set(['a', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'summary', 'option']);
const TEXT_TAGS = new Set([
  'p',
  'span',
  'strong',
  'b',
  'em',
  'td',
  'th',
  'dt',
  'dd',
  'legend',
  'li',
  'small',
]);
const TEST_ID_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-qa', 'data-cy'];
const KEPT_ATTRS = [
  'id',
  'class',
  'name',
  'type',
  'for',
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-hidden',
  'placeholder',
  'value',
  'title',
  'href',
  'hidden',
  'disabled',
  'readonly',
  'checked',
  'selected',
  ...TEST_ID_ATTRS,
];

function isAdContainer(element: HtmlElement): boolean {
  const idTokens = element.attrs.id ? [element.attrs.id] : [];
  const classTokens = (element.attrs.class ?? '').split(/\s+/).filter(Boolean);
  return [...idTokens, ...classTokens].some((token) => AD_TOKEN.test(token));
}

/** Removes noise subtrees in place so neither the summaries nor the trimmed DOM ever see them. */
function pruneNoise(root: HtmlElement): void {
  const prune = (element: HtmlElement): void => {
    for (let i = element.children.length - 1; i >= 0; i--) {
      const child = element.children[i];
      if (child.type !== 'element') continue;
      if (DROP_TAGS.has(child.tag) || isAdContainer(child)) element.children.splice(i, 1);
      else prune(child);
    }
  };
  prune(root);
}

function hiddenHint(element: HtmlElement): boolean {
  const { attrs } = element;
  const style = (attrs.style ?? '').replace(/\s+/g, '').toLowerCase();
  return (
    attrs.type === 'hidden' ||
    attrs.hidden !== undefined ||
    attrs['aria-hidden'] === 'true' ||
    style.includes('display:none') ||
    style.includes('visibility:hidden')
  );
}

function describe(element: HtmlElement): string {
  const first = (element.attrs.class ?? '').split(/\s+/).filter(Boolean)[0];
  return `${element.tag}${element.attrs.id ? `#${element.attrs.id}` : ''}${first ? `.${first}` : ''}`;
}

function isInteresting(element: HtmlElement): boolean {
  if (CONTROL_TAGS.has(element.tag)) return element.attrs.type !== 'hidden';
  if (LANDMARK_TAGS.has(element.tag)) return true;
  if (element.attrs.role || element.attrs['aria-label'] || TEST_ID_ATTRS.some((attr) => element.attrs[attr]))
    return true;
  if (TEXT_TAGS.has(element.tag)) {
    const text = textContent(element);
    return text.length > 0 && text.length <= 60;
  }
  return false;
}

interface LabelIndex {
  byFor: Map<string, HtmlElement>;
}

function labelFor(element: HtmlElement, index: LabelIndex): string | undefined {
  const byId = element.attrs.id ? index.byFor.get(element.attrs.id) : undefined;
  if (byId) return textContent(byId) || undefined;
  const wrapping = ancestors(element).find((ancestor) => ancestor.tag === 'label');
  return wrapping ? textContent(wrapping) || undefined : undefined;
}

function accessibleName(
  element: HtmlElement,
  role: string | undefined,
  label: string | undefined,
  root: HtmlElement,
): string | undefined {
  const { attrs } = element;
  if (attrs['aria-label']) return collapseWhitespace(attrs['aria-label']);
  if (attrs['aria-labelledby']) {
    const labelled = attrs['aria-labelledby']
      .split(/\s+/)
      .map((id) => findText(root, id))
      .filter(Boolean)
      .join(' ');
    if (labelled) return labelled;
  }
  if (label) return label;
  if (element.tag === 'input' && role === 'button') return attrs.value || undefined;
  if (!CONTROL_TAGS.has(element.tag) || element.tag === 'button') {
    const text = textContent(element);
    if (text) return text.slice(0, 120);
  }
  return attrs.title || attrs.placeholder || undefined;
}

function findText(root: HtmlElement, id: string): string {
  let text = '';
  walk(root, (element) => {
    if (!text && element.attrs.id === id) text = textContent(element);
  });
  return text;
}

function summarise(
  element: HtmlElement,
  root: HtmlElement,
  index: LabelIndex,
  query: string[],
): ElementSummary {
  const role = implicitRole(element.tag, element.attrs);
  const label = CONTROL_TAGS.has(element.tag) ? labelFor(element, index) : undefined;
  const name = accessibleName(element, role, label, root);
  const text = textContent(element);
  const container = ancestors(element).find((ancestor) => ancestor.attrs.id);
  const classes = (element.attrs.class ?? '').split(/\s+/).filter(Boolean);
  const testId = TEST_ID_ATTRS.map((attr) => element.attrs[attr]).find(Boolean);
  const summary: ElementSummary = {
    tag: element.tag,
    id: element.attrs.id || undefined,
    classes,
    name: element.attrs.name || undefined,
    type: element.attrs.type || undefined,
    role,
    accessibleName: name,
    labelText: label,
    text: text ? text.slice(0, 120) : undefined,
    placeholder: element.attrs.placeholder || undefined,
    testId,
    containerId: container?.attrs.id,
    path: [...ancestors(element).slice(0, 3).reverse(), element].map(describe).join(' > '),
    hiddenHint: hiddenHint(element) || ancestors(element).some(hiddenHint),
    score: 0,
  };
  const lexical = score(query, [
    { text: summary.accessibleName, weight: 1 },
    { text: summary.labelText, weight: 1 },
    { text: summary.id, weight: 0.9 },
    { text: summary.testId, weight: 0.9 },
    { text: summary.text, weight: 0.8 },
    { text: summary.name, weight: 0.7 },
    { text: summary.placeholder, weight: 0.6 },
    { text: classes.join(' '), weight: 0.4 },
    { text: summary.containerId, weight: 0.3 },
  ]);
  summary.score = Number((summary.hiddenHint ? lexical * 0.5 : lexical).toFixed(3));
  return summary;
}

function openTag(element: HtmlElement): string {
  const attrs = KEPT_ATTRS.filter((attr) => element.attrs[attr] !== undefined)
    .map((attr) => {
      const raw = element.attrs[attr];
      const value =
        attr === 'href' && raw.length > 60
          ? `${raw.slice(0, 57)}…`
          : raw.length > 80
            ? `${raw.slice(0, 77)}…`
            : raw;
      return raw === '' ? attr : `${attr}="${value.replace(/"/g, '&quot;')}"`;
    })
    .join(' ');
  return `<${element.tag}${attrs ? ` ${attrs}` : ''}>`;
}

interface Serializer {
  interesting: Set<HtmlElement>;
  emitted: Set<HtmlElement>;
  hasInteresting: Map<HtmlElement, boolean>;
}

function hasInterestingDescendant(element: HtmlElement, state: Serializer): boolean {
  const cached = state.hasInteresting.get(element);
  if (cached !== undefined) return cached;
  const result = element.children.some(
    (child) =>
      child.type === 'element' && (state.interesting.has(child) || hasInterestingDescendant(child, state)),
  );
  state.hasInteresting.set(element, result);
  return result;
}

/** Serialises a container keeping only interesting descendants (and the ancestors that lead to them). */
function serialize(element: HtmlElement, state: Serializer, lines: string[], budget: { left: number }): void {
  if (budget.left <= 0) return;
  if (state.emitted.has(element)) {
    lines.push(`<!-- ${describe(element)} shown above -->`);
    return;
  }
  state.emitted.add(element);
  const open = openTag(element);
  lines.push(open);
  budget.left -= open.length + 1;
  let omitted = 0;
  for (const child of element.children) {
    if (budget.left <= 0) {
      lines.push('<!-- truncated -->');
      break;
    }
    if (child.type === 'text') {
      const text = collapseWhitespace(child.text);
      if (!text) continue;
      const clipped = text.length > 80 ? `${text.slice(0, 77)}…` : text;
      lines.push(clipped);
      budget.left -= clipped.length + 1;
      continue;
    }
    if (state.interesting.has(child) || hasInterestingDescendant(child, state))
      serialize(child, state, lines, budget);
    else omitted++;
  }
  if (omitted > 0) lines.push(`<!-- ${omitted} element${omitted === 1 ? '' : 's'} omitted -->`);
  lines.push(`</${element.tag}>`);
  budget.left -= element.tag.length + 4;
}

function containerOf(element: HtmlElement): HtmlElement {
  const parent = element.parent;
  const grandparent = parent?.parent;
  if (grandparent && grandparent.tag !== '#root' && grandparent.tag !== 'body' && grandparent.tag !== 'html')
    return grandparent;
  if (parent && parent.tag !== '#root') return parent;
  return element;
}

function ariaExcerpt(aria: string | undefined, query: string[], maxChars: number): string {
  if (!aria) return '';
  const lines = aria.split('\n');
  const scored = lines
    .map((line, index) => ({ index, value: tokenOverlap(query, tokens(line)) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const keep = new Set<number>();
  for (const { index } of scored)
    for (let i = Math.max(0, index - 5); i <= Math.min(lines.length - 1, index + 5); i++) keep.add(i);
  const ordered = [...keep].sort((a, b) => a - b);
  const out: string[] = [];
  let previous = -2;
  for (const index of ordered) {
    if (index !== previous + 1) out.push('…');
    out.push(lines[index]);
    previous = index;
  }
  const text = out.join('\n');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…` : text;
}

export function queryTokens(query: ContextQuery): string[] {
  return [
    ...new Set([
      ...stepTokens(query.stepText),
      ...(query.locator ? selectorTokens(query.locator.literal) : []),
    ]),
  ];
}

export function buildContext(
  html: string,
  aria: string | undefined,
  query: ContextQuery,
  budget: ContextBudget = DEFAULT_BUDGET,
): HealingContext {
  const root = parseHtml(html);
  pruneNoise(root);
  const index: LabelIndex = { byFor: new Map() };
  walk(root, (element) => {
    if (element.tag === 'label' && element.attrs.for) index.byFor.set(element.attrs.for, element);
  });
  const terms = queryTokens(query);
  const interesting: HtmlElement[] = [];
  walk(root, (element) => {
    if (isInteresting(element)) interesting.push(element);
  });
  const summaries = new Map<HtmlElement, ElementSummary>();
  for (const element of interesting) summaries.set(element, summarise(element, root, index, terms));

  // Rank containers (grandparents) by their best element so the most relevant markup is emitted first.
  const containers = new Map<HtmlElement, number>();
  for (const element of interesting) {
    const container = containerOf(element);
    containers.set(container, Math.max(containers.get(container) ?? 0, summaries.get(element)?.score ?? 0));
  }
  const ranked = [...containers.entries()].sort((a, b) => b[1] - a[1]).map(([container]) => container);
  const state: Serializer = {
    interesting: new Set(interesting),
    emitted: new Set(),
    hasInteresting: new Map(),
  };
  const lines: string[] = [];
  const remaining = { left: budget.domChars };
  let emittedContainers = 0;
  for (const container of ranked) {
    if (remaining.left <= 0) break;
    if (state.emitted.has(container)) continue;
    const snippet: string[] = [];
    serialize(container, state, snippet, { left: Math.min(remaining.left, 3000) });
    const text = snippet.join('\n');
    lines.push(text);
    remaining.left -= text.length + 2;
    emittedContainers++;
  }
  const elements = [...summaries.values()].sort((a, b) => b.score - a.score);
  const trimmedDom = lines.join('\n\n');
  return {
    trimmedDom,
    ariaExcerpt: ariaExcerpt(aria, terms, budget.ariaChars),
    elements,
    stats: {
      originalChars: html.length,
      trimmedChars: trimmedDom.length,
      elements: elements.length,
      containers: emittedContainers,
    },
  };
}
