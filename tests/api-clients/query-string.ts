/**
 * A single query value. Arrays are serialised as repeated parameters (`?genre=a&genre=b`), which
 * the API is specified to reject - the suite needs to be able to send that on purpose. `undefined`
 * omits the parameter; an empty string is sent as `key=` so "present but empty" is testable too.
 */
export type QueryValue = string | number | boolean | undefined | ReadonlyArray<string | number>;

export type QueryInput = Readonly<Record<string, QueryValue>>;

/**
 * Builds the `?a=1&b=2` suffix (or an empty string). URLSearchParams takes care of percent-encoding,
 * so unicode and characters such as `&`, `<` or `%` reach the server intact and unambiguous.
 */
export function buildQueryString(query: QueryInput = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.append(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/**
 * Turns the two-column data table of a Gherkin step (`| limit | 0 |`) into query input. Cells are
 * always strings, which is exactly what reaches the server: no coercion happens on the way out, so
 * a scenario that says `| page | 1.5 |` sends `page=1.5` verbatim.
 */
export function queryFromRows(rows: ReadonlyArray<readonly string[]>): QueryInput {
  const query: Record<string, QueryValue> = {};
  for (const [key, value] of rows) {
    if (!key) throw new Error('Query parameter rows must start with a parameter name');
    query[key] = value ?? '';
  }
  return query;
}
