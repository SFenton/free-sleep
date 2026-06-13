import _ from 'lodash';
import express, { Request, Response } from 'express';
import logger from '../../logger.js';

const router = express.Router();

import settingsDB from '../../db/settings.js';
import { Settings, SettingsSchema } from '../../db/settingsSchema.js';
import { DeepPartial } from 'ts-essentials';
import { ZodError } from 'zod';

export async function updateSettings(settingsUpdate: DeepPartial<Settings>) {
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

router.get('/settings', async (req: Request, res: Response) => {
  await settingsDB.read();
  res.json(settingsDB.data);
});


router.post('/settings', async (req: Request, res: Response) => {
  const { body } = req;
  try {
    const data = await updateSettings(body as DeepPartial<Settings>);
    res.status(200).json(data);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    res.status(400).json({
      error: 'Invalid request data',
      details: error.errors,
    });
  }
});


export default router;
