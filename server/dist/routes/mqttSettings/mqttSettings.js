import express from 'express';
import { ZodError } from 'zod';
import mqttSettingsDB from '../../db/mqttSettings.js';
import { MqttSettingsSchema, MqttSettingsUpdateSchema } from '../../db/mqttSettingsSchema.js';
import { normalizeMqttSettings, reloadMqttServiceSettings } from '../../mqtt/mqttService.js';
import logger from '../../logger.js';
const router = express.Router();
export async function updateMqttSettings(mqttSettingsUpdate) {
    const validationResult = MqttSettingsUpdateSchema.safeParse(mqttSettingsUpdate);
    if (!validationResult.success) {
        logger.error('Invalid MQTT settings update:', validationResult.error);
        throw validationResult.error;
    }
    await mqttSettingsDB.read();
    const mergedSettings = {
        ...mqttSettingsDB.data,
        ...validationResult.data,
    };
    const fullValidationResult = MqttSettingsSchema.safeParse(mergedSettings);
    if (!fullValidationResult.success) {
        logger.error('Invalid MQTT settings:', fullValidationResult.error);
        throw fullValidationResult.error;
    }
    mqttSettingsDB.data = normalizeMqttSettings(fullValidationResult.data);
    await mqttSettingsDB.write();
    await reloadMqttServiceSettings();
    return mqttSettingsDB.data;
}
router.get('/mqttSettings', async (_req, res) => {
    await mqttSettingsDB.read();
    res.json(mqttSettingsDB.data);
});
router.post('/mqttSettings', async (req, res) => {
    try {
        const data = await updateMqttSettings(req.body);
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
//# sourceMappingURL=mqttSettings.js.map