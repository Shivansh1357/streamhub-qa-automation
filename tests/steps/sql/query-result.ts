import type { DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import type { CustomWorld } from '../../support/world';
import type { ResultRow } from './sql-files';

const RESULT_KEY = 'sql.lastResult';

export function rememberResult(world: CustomWorld, rows: ResultRow[]): void {
  world.remember(RESULT_KEY, rows);
}

export function recallResult(world: CustomWorld): ResultRow[] {
  return world.recall<ResultRow[]>(RESULT_KEY);
}

/**
 * Render a cell the way psql prints it, so a Gherkin table can be compared with the
 * result verbatim. NUMERIC and BIGINT already arrive as strings ('980.00', '3'); DATE is
 * kept as text by sql-files.ts; anything else falls back to String().
 */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function rowsWhere(rows: ResultRow[], column: string, value: string): ResultRow[] {
  return rows.filter((row) => cellText(row[column]) === value);
}

/** Keep only the columns the Gherkin table names, so a table may assert a subset of the output. */
function project(rows: ResultRow[], columns: string[]): Record<string, string>[] {
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => {
        if (!(column in row)) {
          throw new Error(
            `Column "${column}" is not in the query result (columns: ${Object.keys(row).join(', ')})`,
          );
        }
        return [column, cellText(row[column])];
      }),
    ),
  );
}

/** Exact match: same rows, same order (every query has a deterministic ORDER BY), no extras. */
export function expectRowsToEqualTable(rows: ResultRow[], table: DataTable, description: string): void {
  const [columns] = table.raw();
  expect(project(rows, columns), description).toEqual(table.hashes());
}
