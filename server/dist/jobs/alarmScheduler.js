import schedule from 'node-schedule';
import cbor from 'cbor';
import moment from 'moment-timezone';
import logger from '../logger.js';
import memoryDB from '../db/memoryDB.js';
import serverStatus from '../serverStatus.js';
import schedulesDB from '../db/schedules.js';
import settingsDB from '../db/settings.js';
import { dailyAlarmSchedules } from '../db/scheduleAlarms.js';
import { executeFunction } from '../8sleep/deviceApi.js';
import { getDayIndexForSchedule, logJob } from './utils.js';
import { connectFranken } from '../8sleep/frankenServer.js';
export const executeAlarm = async ({ vibrationIntensity, duration, vibrationPattern, side, force = false }) => {
    try {
        const min10Duration = Math.max(10, duration);
        // Exit is side is in away mode
        await settingsDB.read();
        if (settingsDB.data[side].awayMode && !force) {
            if (settingsDB.data[side].awayMode) {
                logger.debug('Not executing alarm, this side is in away mode!');
                return;
            }
        }
        // Exit if side is off
        const franken = await connectFranken();
        const resp = await franken.getDeviceStatus();
        if (!resp[side].isOn && !force) {
            logger.debug('Not executing alarm, side is off!');
            return;
        }
        const currentTime = moment.tz(settingsDB.data.timeZone);
        const alarmTimeEpoch = currentTime.unix();
        const alarmPayload = {
            pl: vibrationIntensity,
            du: min10Duration,
            pi: vibrationPattern,
            tt: alarmTimeEpoch,
        };
        const cborPayload = cbor.encode(alarmPayload);
        const hexPayload = cborPayload.toString('hex');
        const command = side === 'left' ? 'ALARM_LEFT' : 'ALARM_RIGHT';
        logger.debug(`Executing alarm... ${JSON.stringify(alarmPayload)}`);
        await executeFunction(command, hexPayload);
        await memoryDB.read();
        memoryDB.data[side].isAlarmVibrating = true;
        await memoryDB.write();
        setTimeout(async () => {
            logger.debug('');
            await memoryDB.read();
            memoryDB.data[side].isAlarmVibrating = false;
            await memoryDB.write();
        }, min10Duration * 1_000);
        serverStatus.status.alarmSchedule.status = 'healthy';
        serverStatus.status.alarmSchedule.message = '';
    }
    catch (error) {
        serverStatus.status.alarmSchedule.status = 'failed';
        const message = error instanceof Error ? error.message : String(error);
        serverStatus.status.alarmSchedule.message = message;
        logger.error(error);
    }
};
/**
 * Next occurrence of HH:mm in tz (today or tomorrow depending on 'now').
 * If the HH:mm is already passed for 'now', schedule for tomorrow.
 */
function nextOccurrenceHhMm(tz, hhmm) {
    const now = moment.tz(tz);
    const [h, m] = hhmm.split(':').map(Number);
    const candidate = now.clone().hour(h).minute(m).second(0).millisecond(0);
    if (candidate.isSameOrBefore(now)) {
        candidate.add(1, 'day');
    }
    return candidate;
}
export function scheduleAlarmOverride(settingsData, side) {
    if (!settingsData[side].alarmsEnabled)
        return null;
    const alarmOverride = settingsData[side]?.scheduleOverrides?.alarm;
    if (!alarmOverride || alarmOverride.disabled)
        return null;
    if (!alarmOverride.timeOverride || !alarmOverride.expiresAt)
        return null;
    const now = moment.tz(settingsData.timeZone);
    const expiresAt = moment.tz(alarmOverride.expiresAt, settingsData.timeZone);
    if (!expiresAt.isAfter(now))
        return null;
    const next = nextOccurrenceHhMm(settingsData.timeZone, alarmOverride.timeOverride);
    logger.debug(`Alarm override is set! Scheduling alarm for ${next.format()}`);
    schedule.scheduleJob(`${side}-alarm-override-${alarmOverride.timeOverride}`, next.toDate(), async () => {
        const dayKey = next.tz(settingsData.timeZone).format('dddd').toLowerCase();
        const daySchedule = schedulesDB.data?.[side]?.[dayKey];
        const sourceAlarm = daySchedule ? dailyAlarmSchedules(daySchedule)[0] : null;
        const { vibrationIntensity, duration, vibrationPattern } = sourceAlarm ?? {
            vibrationIntensity: 100,
            duration: 60,
            vibrationPattern: 'rise',
        };
        await executeAlarm({
            side,
            vibrationIntensity,
            duration,
            vibrationPattern,
        });
    });
}
export const scheduleAlarm = (settingsData, side, day, dailySchedule) => {
    if (!settingsData[side].alarmsEnabled)
        return;
    if (settingsData[side].awayMode)
        return;
    if (settingsData.timeZone === null)
        return;
    const enabledAlarms = dailyAlarmSchedules(dailySchedule).filter(alarm => alarm.enabled);
    enabledAlarms.forEach((alarm, alarmIndex) => {
        const alarmRule = new schedule.RecurrenceRule();
        const dayIndex = getDayIndexForSchedule(day, dailySchedule.power.off);
        alarmRule.dayOfWeek = dayIndex;
        const { time } = alarm;
        const [alarmHour, alarmMinute] = time.split(':').map(Number);
        alarmRule.hour = alarmHour;
        alarmRule.minute = alarmMinute;
        alarmRule.tz = settingsData.timeZone;
        logJob('Scheduling alarm job', side, day, dayIndex, time);
        schedule.scheduleJob(`${side}-${day}-${time}-${alarmIndex}-alarm`, alarmRule, async () => {
            try {
                logJob('Executing alarm job', side, day, dayIndex, time);
                await settingsDB.read();
                if (settingsDB.data[side].scheduleOverrides.alarm.expiresAt) {
                    const expiresAt = moment(settingsDB.data[side].scheduleOverrides.alarm.expiresAt);
                    const now = moment();
                    if (expiresAt.isAfter(now)) {
                        logJob(`Detected alarm override! Skipping alarm! Override expires at: ${expiresAt.format()}`, side, day, dayIndex, time);
                        return;
                    }
                }
                await executeAlarm({
                    side,
                    vibrationIntensity: alarm.vibrationIntensity,
                    duration: alarm.duration,
                    vibrationPattern: alarm.vibrationPattern,
                });
            }
            catch (error) {
                serverStatus.status.alarmSchedule.status = 'failed';
                const message = error instanceof Error ? error.message : String(error);
                serverStatus.status.alarmSchedule.message = message;
                logger.error(error);
            }
        });
    });
};
//# sourceMappingURL=alarmScheduler.js.map