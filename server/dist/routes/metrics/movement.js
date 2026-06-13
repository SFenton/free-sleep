import express from 'express';
import { loadMovementData } from './metricQueries.js';
const router = express.Router();
router.get('/movement', async (req, res) => {
    res.json(await loadMovementData(req.query));
});
export default router;
//# sourceMappingURL=movement.js.map