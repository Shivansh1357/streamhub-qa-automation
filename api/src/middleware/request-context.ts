import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/** Per-response state shared between middleware, typed via Express's `Locals` generic. */
export interface AppLocals {
  requestId: string;
}

export type AppHandler = RequestHandler<Record<string, string>, unknown, unknown, unknown, AppLocals>;

/**
 * Only well-formed incoming ids are echoed. Anything else (too long, control characters, header
 * injection attempts) is replaced with a fresh UUID so logs and clients always see a safe value.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const requestContext: AppHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  res.locals.requestId = incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
};
