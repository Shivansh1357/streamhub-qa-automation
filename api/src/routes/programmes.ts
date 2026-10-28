import { Router } from 'express';
import { methodNotAllowed } from '../middleware/not-found';
import type { ProgrammeService } from '../services/programmes';
import { PROGRAMME_ID } from '../validation/patterns';
import { programmeListQuerySchema } from '../validation/programmes';
import { noQueryParams, parseId, parseQuery } from '../validation/query';

export function programmesRouter(service: ProgrammeService): Router {
  const router = Router();

  router
    .route('/')
    .get((req, res) => {
      res.json(service.list(parseQuery(programmeListQuerySchema, req.query)));
    })
    .all(methodNotAllowed(['GET']));

  router
    .route('/:id')
    .get((req, res) => {
      const id = parseId(req.params.id, PROGRAMME_ID, 'prg_001');
      parseQuery(noQueryParams, req.query);
      res.json(service.get(id));
    })
    .all(methodNotAllowed(['GET']));

  return router;
}
