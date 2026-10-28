import { Router } from 'express';
import { methodNotAllowed } from '../middleware/not-found';
import type { ChannelService } from '../services/channels';
import { channelListQuerySchema } from '../validation/channels';
import { CHANNEL_ID } from '../validation/patterns';
import { noQueryParams, parseId, parseQuery } from '../validation/query';

/**
 * Handlers are synchronous because the repository is in memory. Should it become asynchronous
 * (a database, for instance) they can be made `async` as-is: Express 5 forwards rejections to the
 * error handler without extra wrapping.
 */
export function channelsRouter(service: ChannelService): Router {
  const router = Router();

  router
    .route('/')
    .get((req, res) => {
      res.json(service.list(parseQuery(channelListQuerySchema, req.query)));
    })
    .all(methodNotAllowed(['GET']));

  router
    .route('/:id')
    .get((req, res) => {
      const id = parseId(req.params.id, CHANNEL_ID, 'ch_001');
      parseQuery(noQueryParams, req.query);
      res.json(service.get(id));
    })
    .all(methodNotAllowed(['GET']));

  return router;
}
