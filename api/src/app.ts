import express from 'express';
import path from 'node:path';
import { version } from '../../package.json';
import { loadDataset } from './data/dataset';
import { createRepository } from './data/repository';
import { errorHandler } from './middleware/error-handler';
import { notFound } from './middleware/not-found';
import { requestContext } from './middleware/request-context';
import { requestLogger } from './middleware/request-logger';
import { audienceRouter } from './routes/audience';
import { channelsRouter } from './routes/channels';
import { healthRouter } from './routes/health';
import { programmesRouter } from './routes/programmes';
import { AudienceService } from './services/audience';
import { ChannelService } from './services/channels';
import { ProgrammeService } from './services/programmes';

const DATA_DIR = path.resolve(__dirname, '..', 'data');

/**
 * Builds the application without binding a port, so it can be mounted in-process by tests or
 * served by server.ts. The dataset is read and validated exactly once, here.
 */
export function createApp(): express.Express {
  const repository = createRepository(loadDataset(DATA_DIR));

  const app = express();
  app.disable('x-powered-by');
  app.set('json spaces', 2);

  app.use(requestContext);
  app.use(requestLogger);

  app.use('/health', healthRouter(version));
  app.use('/api/v1/channels', channelsRouter(new ChannelService(repository)));
  app.use('/api/v1/programmes', programmesRouter(new ProgrammeService(repository)));
  app.use('/api/v1/audience', audienceRouter(new AudienceService(repository)));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
