import type { ErrorRequestHandler } from 'express';
import { ApiError } from '../errors';
import type { AppLocals } from './request-context';

/** Errors raised by Express itself (e.g. a path segment with broken percent-encoding) carry an HTTP status. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const status = statusOf(error);
  if (status === 400)
    return ApiError.validation([{ field: 'url', message: 'request path could not be decoded' }]);
  return ApiError.internal();
}

/**
 * The last middleware. Known errors become their envelope; anything unexpected is logged with the
 * request id (stack included) and reported as a generic 500, so the process never crashes and
 * internals never leak to the client. Express 5 routes rejected handler promises here as well.
 */
export const errorHandler: ErrorRequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  unknown,
  AppLocals
> = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const apiError = toApiError(error);
  if (apiError.status >= 500) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(`[request ${res.locals.requestId}] unhandled error: ${detail}`);
  }
  for (const [name, value] of Object.entries(apiError.headers)) res.setHeader(name, value);
  res.status(apiError.status).json(apiError.toEnvelope());
};
