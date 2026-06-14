import express, { Request, Response, Router } from 'express';
import moment from 'moment-timezone';
import { z, ZodError } from 'zod';
import logger from '../../logger.js';
import settingsDB from '../../db/settings.js';
import { notifyPresenceUpdated } from '../../events/stateUpdateEvents.js';

const router: Router = express.Router();

const PresenceSideSchema = z.object({
  present: z.boolean(),
  lastUpdatedAt: z.string().optional(),
});

export const PresenceDataSchema = z.object({
  left: PresenceSideSchema.optional(),
  right: PresenceSideSchema.optional(),
});

type PresenceSide = z.infer<typeof PresenceSideSchema>;

type PresenceDataState = {
  left: PresenceSide;
  right: PresenceSide;
};

export type PresenceData = z.infer<typeof PresenceDataSchema>;

class PresenceUpdateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PresenceUpdateError';
  }
}

// In-memory storage for presence data
// Default values are null until first update
const presenceData: PresenceDataState = {
  left: {
    present: false,
    lastUpdatedAt: moment.tz(settingsDB.data.timeZone).format(),
  },
  right: {
    present: false,
    lastUpdatedAt: moment.tz(settingsDB.data.timeZone).format(),
  },
};

export const getPresenceData = () => presenceData;

export async function updatePresenceData(update: unknown) {
  await settingsDB.read();
  const validationResult = PresenceDataSchema.safeParse(update);
  if (!validationResult.success) {
    logger.error('Invalid presence update:', validationResult.error);
    throw validationResult.error;
  }

  const data = validationResult.data;
  if (!data.left && !data.right) {
    throw new PresenceUpdateError('At least one side (left or right) must be specified');
  }

  const currentTime = moment.tz(settingsDB.data.timeZone).format();

  if (data.left) {
    presenceData.left.present = data.left.present;
    presenceData.left.lastUpdatedAt = currentTime;
  }

  if (data.right) {
    presenceData.right.present = data.right.present;
    presenceData.right.lastUpdatedAt = currentTime;
  }

  notifyPresenceUpdated();
  return presenceData;
}

/**
 * POST /presence
 * Update presence data for one or both sides
 */
router.post('/presence', async (req: Request, res: Response) => {
  try {
    const { body } = req;
    return res.status(200).json(await updatePresenceData(body));

  } catch (error) {
    logger.error('Error updating presence:', error);
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }
    if (error instanceof PresenceUpdateError) {
      return res.status(400).json({
        error: error.message,
        message: 'Please provide "left" and/or "right" with boolean values'
      });
    }
    throw error;
  }
});

/**
 * GET /presence
 */
router.get('/presence', (req: Request, res: Response) => {
  return res.status(200).json(getPresenceData());
});

export default router;
