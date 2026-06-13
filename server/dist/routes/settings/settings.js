import _ from 'lodash';
import express from 'express';
import logger from '../../logger.js';
const router = express.Router();
import settingsDB from '../../db/settings.js';
import { SettingsSchema } from '../../db/settingsSchema.js';
import { ZodError } from 'zod';
export async function updateSettings(settingsUpdate) {
    const validationResult = SettingsSchema.deepPartial().safeParse(settingsUpdate);
    if (!validationResult.success) {
        logger.error('Invalid settings update:', validationResult.error);
        throw validationResult.error;
    }
    const data = _.omit(validationResult.data, 'id');
    await settingsDB.read();
    _.merge(settingsDB.data, data);
    await settingsDB.write();
    return settingsDB.data;
}
router.get('/settings', async (req, res) => {
    await settingsDB.read();
    res.json(settingsDB.data);
});
router.post('/settings', async (req, res) => {
    const { body } = req;
    try {
        const data = await updateSettings(body);
        res.status(200).json(data);
    }
    catch (error) {
        if (!(error instanceof ZodError))
            throw error;
        res.status(400).json({
            error: 'Invalid request data',
            details: error.errors,
        });
    }
});
export default router;
//# sourceMappingURL=settings.js.map