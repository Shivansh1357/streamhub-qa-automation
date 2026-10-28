import { ApiError } from '../errors';
import type { AppHandler } from './request-context';

/** Terminal middleware: nothing above matched the path at all. */
export const notFound: AppHandler = (_req, _res, next) => {
  next(ApiError.notFound('Route not found'));
};

/**
 * Attached with `.all()` after the `.get()` of each route, so a known path with the wrong method is
 * answered with 405 and an Allow header instead of falling through to the generic 404.
 */
export function methodNotAllowed(allowed: readonly string[]): AppHandler {
  return (req, _res, next) => {
    next(ApiError.methodNotAllowed(req.method, allowed));
  };
}
