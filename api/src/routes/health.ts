import { Router } from 'express';
import { methodNotAllowed } from '../middleware/not-found';

export function healthRouter(version: string): Router {
  const router = Router();
  router
    .route('/')
    .get((_req, res) => {
      res.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()), version });
    })
    .all(methodNotAllowed(['GET']));
  return router;
}
