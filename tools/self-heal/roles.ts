/**
 * Implicit ARIA role mapping, shared by the DOM trimmer (Node side) and the validator (which reads the
 * tag + attributes out of the browser and classifies them here, so both sides agree).
 */
export function implicitRole(tag: string, attrs: Record<string, string>): string | undefined {
  const explicit = attrs.role?.trim().split(/\s+/)[0];
  if (explicit) return explicit.toLowerCase();
  switch (tag) {
    case 'a':
    case 'area':
      return attrs.href !== undefined ? 'link' : undefined;
    case 'button':
      return 'button';
    case 'input':
      return inputRole((attrs.type ?? 'text').toLowerCase());
    case 'select':
      return attrs.multiple !== undefined || Number(attrs.size) > 1 ? 'listbox' : 'combobox';
    case 'textarea':
      return 'textbox';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return 'heading';
    case 'img':
      return 'img';
    case 'ul':
    case 'ol':
      return 'list';
    case 'li':
      return 'listitem';
    case 'nav':
      return 'navigation';
    case 'form':
      return 'form';
    case 'table':
      return 'table';
    case 'option':
      return 'option';
    case 'p':
      return 'paragraph';
    case 'main':
      return 'main';
    default:
      return undefined;
  }
}

function inputRole(type: string): string | undefined {
  switch (type) {
    case 'button':
    case 'submit':
    case 'reset':
    case 'image':
      return 'button';
    case 'checkbox':
      return 'checkbox';
    case 'radio':
      return 'radio';
    case 'range':
      return 'slider';
    case 'number':
      return 'spinbutton';
    case 'search':
      return 'searchbox';
    case 'hidden':
      return undefined;
    default:
      return 'textbox';
  }
}

/** The ARIA roles Playwright's getByRole() accepts; anything else is rejected before it reaches the browser. */
export const ARIA_ROLES: ReadonlySet<string> = new Set([
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'button',
  'caption',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'directory',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'meter',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'subscript',
  'superscript',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
]);
