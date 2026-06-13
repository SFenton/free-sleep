import express, { Request, Response } from 'express';
import { loadMovementData, MetricsQuery } from './metricQueries.js';

const router = express.Router();

router.get('/movement', async (req: Request<object, object, object, MetricsQuery>, res: Response) => {
  res.json(await loadMovementData(req.query));
});



export default router;
