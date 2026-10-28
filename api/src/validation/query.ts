import { z, type ZodIssue } from 'zod';
import { ApiError, type ErrorDetail } from '../errors';

/**
 * Flattens zod issues into the `details[]` of the error envelope, one entry per offending query
 * parameter. zod reports unknown keys as a single root-level issue listing every key, which is
 * expanded so that each unexpected parameter is named individually.
 */
export function issuesToDetails(issues: readonly ZodIssue[]): ErrorDetail[] {
  return issues.flatMap((issue): ErrorDetail[] => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({ field: key, message: 'is not a recognised query parameter' }));
    }
    return [{ field: issue.path.map(String).join('.') || '(query)', message: issue.message }];
  });
}

/**
 * For endpoints that take no query parameters at all. Single-resource lookups use it so that
 * `/programmes/prg_001?expand=channel` is a 400 like any other unknown parameter, rather than a
 * silently ignored request - the same reasoning as the strict list schemas.
 */
export const noQueryParams = z.object({}).strict();

export function parseQuery<S extends z.ZodType>(schema: S, query: unknown): z.output<S> {
  const result = schema.safeParse(query);
  if (!result.success) throw ApiError.validation(issuesToDetails(result.error.issues));
  return result.data;
}

/**
 * Path ids are validated before any lookup so that a malformed id is reported as a client mistake
 * (400) rather than being indistinguishable from a well-formed id that simply does not exist (404).
 */
export function parseId(value: string, pattern: RegExp, example: string): string {
  if (!pattern.test(value)) throw ApiError.invalidId('id', pattern, example);
  return value;
}
