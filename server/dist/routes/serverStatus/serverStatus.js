
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="375a77ba-4c43-5c70-8b2b-3a18c3d358b8")}catch(e){}}();
import express from 'express';
import serverStatus from '../../serverStatus.js';
const router = express.Router();
// Endpoint to list all log files as clickable links
router.get('/', async (req, res) => {
    const response = await serverStatus.toJSON();
    res.json(response);
});
export default router;
//# sourceMappingURL=serverStatus.js.map
//# debugId=375a77ba-4c43-5c70-8b2b-3a18c3d358b8
