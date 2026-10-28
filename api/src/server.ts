/**
 * Process entry point and the only module that reads the environment. `PORT` (default 4010) is
 * the single knob; everything else is fixed so that tests and humans see the same behaviour.
 */
import { createApp } from './app';

const DEFAULT_PORT = 4010;
const SHUTDOWN_GRACE_MS = 5_000;

function resolvePort(): number {
  const raw = process.env.PORT;
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${raw}"`);
  }
  return port;
}

const port = resolvePort();
const server = createApp().listen(port, () => {
  console.log(`Streamhub Audience Analytics API listening on http://localhost:${port}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  const hint = error.code === 'EADDRINUSE' ? ` (is another instance already running on port ${port}?)` : '';
  console.error(`Failed to start the API: ${error.message}${hint}`);
  process.exit(1);
});

// The test hooks stop the server with SIGTERM; finish in-flight responses, then exit cleanly.
function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
