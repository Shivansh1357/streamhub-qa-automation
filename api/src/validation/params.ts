import { z } from 'zod';
import { isValidIsoDate } from '../utils/dates';

/**
 * Building blocks for query-string validation. Query values always arrive as strings, so numeric
 * parameters are coerced explicitly and strictly: "1.5" is not an integer, "abc" is not a number
 * and "" is not zero. Each builder reports a single, human-readable message per problem.
 */
const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

export function integerParam(min: number, max: number): z.ZodType<number, string> {
  return z
    .string()
    .regex(INTEGER, { error: 'must be an integer' })
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, { error: `must be at least ${min}` })
        .max(max, { error: `must be at most ${max}` }),
    );
}

export function numberParam(min: number, max: number): z.ZodType<number, string> {
  return z
    .string()
    .regex(DECIMAL, { error: 'must be a number' })
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, { error: `must be at least ${min}` })
        .max(max, { error: `must be at most ${max}` }),
    );
}

export function enumParam<const T extends readonly [string, ...string[]]>(
  values: T,
): z.ZodEnum<{ [K in T[number]]: K }> {
  return z.enum(values, { error: `must be one of: ${values.join(', ')}` });
}

export function patternParam(pattern: RegExp, description: string): z.ZodString {
  return z.string().regex(pattern, { error: `must be ${description}` });
}

/**
 * A calendar-valid YYYY-MM-DD string; "is required" when absent so the field still appears in
 * details. Format and calendar validity are one check so a bad value yields exactly one message.
 */
export function dateParam(): z.ZodType<string, string> {
  return z
    .string({ error: (issue) => (issue.input === undefined ? 'is required' : 'must be a string') })
    .refine(isValidIsoDate, { error: 'must be a real calendar date in YYYY-MM-DD format' });
}

export type SortOption<F extends string> = F | `-${F}`;

/** Builds the `field | -field` sort vocabulary from a list of sortable fields. Callers attach the default. */
export function sortParam<const F extends readonly [string, ...string[]]>(
  fields: F,
): z.ZodEnum<{ [K in SortOption<F[number]>]: K }> {
  const options: SortOption<F[number]>[] = [
    ...fields,
    ...fields.map((field): SortOption<F[number]> => `-${field as F[number]}`),
  ];
  return z.enum(options, { error: `must be one of: ${options.join(', ')}` });
}
