/**
 * A tiny, dependency-free HTML tokenizer that turns a saved DOM snapshot into a tree.
 *
 * It only has to cope with the well-formed serialisation Playwright's page.content() produces,
 * so there is no error recovery for unclosed tags beyond popping the stack to the nearest match.
 */
export interface HtmlElement {
  readonly type: 'element';
  readonly tag: string;
  readonly attrs: Record<string, string>;
  readonly children: HtmlNode[];
  parent: HtmlElement | null;
}

export interface HtmlText {
  readonly type: 'text';
  readonly text: string;
  parent: HtmlElement | null;
}

export type HtmlNode = HtmlElement | HtmlText;

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Elements whose content is raw text (no nested markup) and must be skipped to the closing tag. */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X'))
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function createElement(tag: string, attrs: Record<string, string>, parent: HtmlElement | null): HtmlElement {
  return { type: 'element', tag, attrs, children: [], parent };
}

function appendText(parent: HtmlElement, raw: string): void {
  if (raw.length === 0) return;
  parent.children.push({ type: 'text', text: decodeEntities(raw), parent });
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === '\f';
}

interface AttributeScan {
  attrs: Record<string, string>;
  selfClosing: boolean;
  end: number;
}

function scanAttributes(html: string, start: number): AttributeScan {
  const attrs: Record<string, string> = {};
  let selfClosing = false;
  let i = start;
  while (i < html.length) {
    while (i < html.length && isWhitespace(html[i])) i++;
    const ch = html[i];
    if (ch === '>') return { attrs, selfClosing, end: i + 1 };
    if (ch === '/') {
      selfClosing = true;
      i++;
      continue;
    }
    const nameStart = i;
    while (i < html.length && !isWhitespace(html[i]) && html[i] !== '=' && html[i] !== '>' && html[i] !== '/')
      i++;
    const name = html.slice(nameStart, i).toLowerCase();
    if (name.length === 0) {
      i++;
      continue;
    }
    while (i < html.length && isWhitespace(html[i])) i++;
    if (html[i] !== '=') {
      attrs[name] = '';
      continue;
    }
    i++;
    while (i < html.length && isWhitespace(html[i])) i++;
    const quote = html[i];
    if (quote === '"' || quote === "'") {
      const close = html.indexOf(quote, i + 1);
      const value = html.slice(i + 1, close === -1 ? html.length : close);
      attrs[name] = decodeEntities(value);
      i = close === -1 ? html.length : close + 1;
    } else {
      const valueStart = i;
      while (i < html.length && !isWhitespace(html[i]) && html[i] !== '>') i++;
      attrs[name] = decodeEntities(html.slice(valueStart, i));
    }
  }
  return { attrs, selfClosing, end: i };
}

function closeTag(stack: HtmlElement[], tag: string): void {
  for (let depth = stack.length - 1; depth > 0; depth--) {
    if (stack[depth].tag === tag) {
      stack.length = depth;
      return;
    }
  }
}

export function parseHtml(html: string): HtmlElement {
  const root = createElement('#root', {}, null);
  const stack: HtmlElement[] = [root];
  const top = (): HtmlElement => stack[stack.length - 1];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      appendText(top(), html.slice(i));
      break;
    }
    if (lt > i) appendText(top(), html.slice(i, lt));
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith('</', lt)) {
      const end = html.indexOf('>', lt);
      closeTag(
        stack,
        html
          .slice(lt + 2, end === -1 ? html.length : end)
          .trim()
          .toLowerCase(),
      );
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    const next = html[lt + 1];
    if (next === '!' || next === '?') {
      const end = html.indexOf('>', lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    const tagMatch = /^[a-zA-Z][a-zA-Z0-9:-]*/.exec(html.slice(lt + 1, lt + 65));
    if (!tagMatch) {
      appendText(top(), '<');
      i = lt + 1;
      continue;
    }
    const tag = tagMatch[0].toLowerCase();
    const { attrs, selfClosing, end } = scanAttributes(html, lt + 1 + tag.length);
    const element = createElement(tag, attrs, top());
    top().children.push(element);
    i = end;
    if (selfClosing || VOID_ELEMENTS.has(tag)) continue;
    if (RAW_TEXT_ELEMENTS.has(tag)) {
      const close = html.toLowerCase().indexOf(`</${tag}`, i);
      appendText(element, html.slice(i, close === -1 ? html.length : close));
      i = close === -1 ? html.length : html.indexOf('>', close) + 1;
      continue;
    }
    stack.push(element);
  }
  return root;
}

export function walk(node: HtmlElement, visit: (element: HtmlElement) => void): void {
  for (const child of node.children) {
    if (child.type !== 'element') continue;
    visit(child);
    walk(child, visit);
  }
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** All descendant text, whitespace-collapsed. */
export function textContent(element: HtmlElement): string {
  const parts: string[] = [];
  const collect = (node: HtmlNode): void => {
    if (node.type === 'text') parts.push(node.text);
    else node.children.forEach(collect);
  };
  collect(element);
  return collapseWhitespace(parts.join(' '));
}

export function ancestors(element: HtmlElement): HtmlElement[] {
  const chain: HtmlElement[] = [];
  for (let node = element.parent; node && node.tag !== '#root'; node = node.parent) chain.push(node);
  return chain;
}

export function findById(root: HtmlElement, id: string): HtmlElement | undefined {
  let found: HtmlElement | undefined;
  walk(root, (element) => {
    if (!found && element.attrs.id === id) found = element;
  });
  return found;
}

/** Strips script/noscript/iframe blocks so a snapshot can be loaded with page.setContent() without running the site's JS. */
export function stripScripts(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '');
}
