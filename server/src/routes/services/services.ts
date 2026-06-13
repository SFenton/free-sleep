import * as Sentry from '@sentry/node';

import _ from 'lodash';
import express, { Request, Response } from 'express';
import logger from '../../logger.js';

const router = express.Router();

import servicesDB from '../../db/services.js';
import { Services, ServicesSchema } from '../../db/servicesSchema.js';
import { initSentry } from '../../instrument.js';
import { setupSentryTags } from '../../setupSentryTags.js';
import { DeepPartial } from 'ts-essentials';
import { ZodError } from 'zod';

export async function updateServices(servicesUpdate: DeepPartial<Services>) {
  const validationResult = ServicesSchema.deepPartial().safeParse(servicesUpdate);
  if (!validationResult.success) {
    logger.error('Invalid services update:', validationResult.error);
    throw validationResult.error;
  }

  const body = validationResult.data;
  if (body?.sentryLogging?.enabled === false) {
    logger.debug('Disabling sentry...');
    void Sentry.close();
  } else if (body?.sentryLogging?.enabled === true) {
    logger.debug('Enabling sentry...');
    initSentry();
    void setupSentryTags();
  }

  await servicesDB.read();
  _.merge(servicesDB.data, body);
  await servicesDB.write();

  return servicesDB.data;
}

router.get('/services', async (req: Request, res: Response) => {
  await servicesDB.read();
  res.json(servicesDB.data);
});


router.post('/services', async (req: Request, res: Response) => {
  const { body } = req;
  try {
    const data = await updateServices(body as DeepPartial<Services>);
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
