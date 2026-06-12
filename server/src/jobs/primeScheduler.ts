import schedule from 'node-schedule';
import { Settings } from '../db/settingsSchema.js';
import logger from '../logger.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import { TimeZone } from '../db/timeZones.js';
import { executeCalibrateSensors } from './calibrateSensors.js';
import { Side } from '../db/schedulesSchema.js';
import moment from 'moment-timezone';
import settingsDB from '../db/settings.js';
import serverStatus from '../serverStatus.js';
import servicesDB from '../db/services.js';
import reboot from './reboot.js';


const scheduleRebootJob = (onHour: number, onMinute: number, timeZone: TimeZone) => {
  const dailyRule = new schedule.RecurrenceRule();
  dailyRule.hour = onHour;
  dailyRule.minute = onMinute;
  dailyRule.tz = timeZone;

  const time = `${String(onHour).padStart(2,'0')}:${String(onMinute).padStart(2,'0')}`;
  logger.debug(`Scheduling daily reboot job at ${time}`);
  schedule.scheduleJob(`daily-reboot-${time}`, dailyRule, async () => {
    try {
      await settingsDB.read();

      if (!settingsDB.data.rebootDaily) {
        logger.info('Daily reboot job is disabled, skipping...');
        return;
      }
      logger.info(`Executing scheduled reboot job`);
      reboot();
      serverStatus.status.alarmSchedule.status = 'healthy';
      serverStatus.status.alarmSchedule.message = '';
    } catch (error: unknown) {
      serverStatus.status.alarmSchedule.status = 'failed';
      const message = error instanceof Error ? error.message : String(error);
      serverStatus.status.alarmSchedule.message = message;
      logger.error(error);
    }
  });
};

const scheduleCalibrationJob = (onHour: number, onMinute: number, timeZone: TimeZone, side: Side) => {
  const dailyRule = new schedule.RecurrenceRule();
  dailyRule.hour = onHour;
  dailyRule.minute = onMinute;
  dailyRule.tz = timeZone;

  const time = `${String(onHour).padStart(2,'0')}:${String(onMinute).padStart(2,'0')}`;
  logger.debug(`Scheduling daily calibration job at ${time} for ${side}`);
  schedule.scheduleJob(`daily-calibration-${time}-${side}`, dailyRule, async () => {
    await servicesDB.read();
    if (!servicesDB.data.biometrics.enabled) {
      logger.debug('Not executing calibration job, biometrics is disabled');
      return;
    }
    logger.info(`Executing scheduled calibration job for ${side}`);
    executeCalibrateSensors(side, moment().subtract(6, 'hours').toISOString(), moment().toISOString());
  });
};


export const schedulePrimingRebootAndCalibration = (settingsData: Settings) => {
  const { timeZone, primePodDaily } = settingsData;
  if (timeZone === null) return;
  if (!primePodDaily.enabled) return;
  const dailyRule = new schedule.RecurrenceRule();
  const { time } = primePodDaily;
  const [onHour, onMinute] = time.split(':').map(Number);
  dailyRule.hour = onHour;
  dailyRule.minute = onMinute;
  dailyRule.tz = timeZone;

  scheduleRebootJob(onHour - 1, onMinute, timeZone);
  scheduleCalibrationJob(onHour, 0, timeZone, 'left');
  scheduleCalibrationJob(onHour, 30, timeZone, 'right');

  logger.debug(`Scheduling daily prime job at ${primePodDaily.time}`);
  schedule.scheduleJob(`daily-priming-${time}`, dailyRule, async () => {
    try {
      logger.info(`Executing scheduled prime job`);
      await updateDeviceStatus({ isPriming: true });
      serverStatus.status.primeSchedule.status = 'healthy';
      serverStatus.status.primeSchedule.message = '';
    } catch (error: unknown) {
      serverStatus.status.primeSchedule.status = 'failed';
      const message = error instanceof Error ? error.message : String(error);
      serverStatus.status.primeSchedule.message = message;
      logger.error(error);
    }
  });
};
