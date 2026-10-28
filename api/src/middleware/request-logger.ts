import type { AppHandler } from './request-context';

/** One line per completed response: timestamp, method, URL, status, elapsed time and request id. */
export const requestLogger: AppHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs.toFixed(1)}ms id=${res.locals.requestId}`,
    );
  });
  next();
};
