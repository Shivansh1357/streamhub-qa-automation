import type { SortOption } from '../validation/params';

export type SortDirection = 'asc' | 'desc';

export interface SortSpec<F extends string> {
  field: F;
  direction: SortDirection;
}

/** `-field` means descending; anything else is ascending. The validation layer guarantees the vocabulary. */
export function parseSort<F extends string>(value: SortOption<F>): SortSpec<F> {
  return value.startsWith('-')
    ? { field: value.slice(1) as F, direction: 'desc' }
    : { field: value as F, direction: 'asc' };
}

/**
 * Strings compare by UTF-16 code unit, numbers numerically. Code-unit order is used instead of a
 * locale-aware collation so results are identical on every runtime and ICU build.
 */
export function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const left = String(a);
  const right = String(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Returns a sorted copy. Ties are always broken by id ascending, regardless of direction, so a
 * given query produces exactly one order; clients can rely on it when paginating.
 */
export function sortById<T extends { id: string }, F extends string>(
  items: readonly T[],
  spec: SortSpec<F>,
  pick: (item: T, field: F) => string | number,
): T[] {
  const sign = spec.direction === 'desc' ? -1 : 1;
  return [...items].sort(
    (a, b) => sign * compareValues(pick(a, spec.field), pick(b, spec.field)) || compareValues(a.id, b.id),
  );
}
