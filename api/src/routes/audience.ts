import { Router } from 'express';
import { methodNotAllowed } from '../middleware/not-found';
import type { AudienceService } from '../services/audience';
import { audienceSummaryQuerySchema } from '../validation/audience';
import { parseQuery } from '../validation/query';

export function audienceRouter(service: AudienceService): Router {
  const router = Router();

  router
    .route('/summary')
    .get((req, res) => {
      res.json(service.summary(parseQuery(audienceSummaryQuerySchema, req.query)));
    })
    .all(methodNotAllowed(['GET']));

  return router;
}
