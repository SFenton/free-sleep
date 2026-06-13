import express, { Request, Response } from 'express';
import { loadVitalsData, loadVitalsSummaryData, MetricsQuery } from './metricQueries.js';


const router = express.Router();


router.get('/vitals', async (req: Request<object, object, object, MetricsQuery>, res: Response) => {
  res.json(await loadVitalsData(req.query));
});


router.get('/vitals/summary', async (req: Request<object, object, object, MetricsQuery>, res: Response) => {
  res.json(await loadVitalsSummaryData(req.query));
});


export default router;
