import _ from 'lodash';
import express from 'express';
import { ZodError } from 'zod';
import logger from '../../logger.js';
import schedulesDB from '../../db/schedules.js';
import { SchedulesSchema, } from '../../db/schedulesSchema.js';
const router = express.Router();
export async function updateSchedules(schedulesUpdate) {
    const validationResult = SchedulesSchema.deepPartial().safeParse(schedulesUpdate);
    if (!validationResult.success) {
        logger.error('Invalid schedules update:', validationResult.error);
        throw validationResult.error;
    }
    const schedules = validationResult.data;
    await schedulesDB.read();
    Object.entries(schedules).forEach(([side, sideSchedule]) => {
        Object.entries(sideSchedule).forEach(([day, schedule]) => {
            if (schedule.power) {
                _.merge(schedulesDB.data[side][day].power, schedule.power);
            }
            if (schedule.temperatures)
                schedulesDB.data[side][day].temperatures = schedule.temperatures;
            if (schedule.alarm)
                schedulesDB.data[side][day].alarm = schedule.alarm;
        });
    });
    await schedulesDB.write();
    return schedulesDB.data;
}
router.get('/schedules', async (req, res) => {
    await schedulesDB.read();
    res.json(schedulesDB.data);
});
router.post('/schedules', async (req, res) => {
    const body = req.body;
    try {
        const data = await updateSchedules(body);
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
//# sourceMappingURL=schedules.js.map