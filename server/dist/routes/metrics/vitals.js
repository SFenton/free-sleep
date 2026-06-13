import express from 'express';
import { loadVitalsData, loadVitalsSummaryData } from './metricQueries.js';
const router = express.Router();
router.get('/vitals', async (req, res) => {
    res.json(await loadVitalsData(req.query));
});
router.get('/vitals/summary', async (req, res) => {
    res.json(await loadVitalsSummaryData(req.query));
});
export default router;
//# sourceMappingURL=vitals.js.map