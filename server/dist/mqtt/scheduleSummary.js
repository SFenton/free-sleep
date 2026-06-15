import moment from 'moment-timezone';
import { dailyAlarmSchedules } from '../db/scheduleAlarms.js';
import { DAYS_OF_WEEK, getDayIndexForSchedule, getDayOfWeekIndex } from '../jobs/utils.js';
const emptySideScheduleSummary = () => ({
    nextPowerOn: null,
    nextPowerOff: null,
    nextAlarm: null,
    nextTemperatureAdjustment: null,
});
const dayFromIndex = (dayIndex) => DAYS_OF_WEEK[dayIndex];
const nextOccurrence = (timeZone, dayIndex, time) => {
    const now = moment.tz(timeZone);
    const [hour, minute] = time.split(':').map(Number);
    const daysUntilTarget = (dayIndex - now.day() + 7) % 7;
    const candidate = now.clone().add(daysUntilTarget, 'days').hour(hour).minute(minute).second(0).millisecond(0);
    if (candidate.isSameOrBefore(now))
        candidate.add(7, 'days');
    return candidate;
};
const nextDailyOccurrence = (timeZone, time) => {
    const now = moment.tz(timeZone);
    const [hour, minute] = time.split(':').map(Number);
    const candidate = now.clone().hour(hour).minute(minute).second(0).millisecond(0);
    if (candidate.isSameOrBefore(now))
        candidate.add(1, 'day');
    return candidate;
};
const earlierEvent = (current, candidate) => {
    if (!current)
        return candidate;
    return candidate.timestamp < current.timestamp ? candidate : current;
};
const buildScheduleEvent = (timeZone, type, side, scheduleDay, executionDayIndex, time, temperatureF, alarmIndex) => ({
    type,
    source: 'schedule',
    side,
    scheduleDay,
    executionDay: dayFromIndex(executionDayIndex),
    time,
    timestamp: nextOccurrence(timeZone, executionDayIndex, time).toISOString(),
    alarmIndex,
    temperatureF,
    enabled: true,
});
const buildAlarmOverrideEvent = (settings, side) => {
    const alarmOverride = settings[side].scheduleOverrides.alarm;
    if (alarmOverride.disabled || !alarmOverride.timeOverride || !alarmOverride.expiresAt)
        return null;
    const now = moment.tz(settings.timeZone);
    const expiresAt = moment.tz(alarmOverride.expiresAt, settings.timeZone);
    if (!expiresAt.isAfter(now))
        return null;
    const next = nextDailyOccurrence(settings.timeZone, alarmOverride.timeOverride);
    const executionDay = dayFromIndex(next.day());
    return {
        type: 'alarm',
        source: 'override',
        side,
        scheduleDay: executionDay,
        executionDay,
        time: alarmOverride.timeOverride,
        timestamp: next.toISOString(),
        enabled: true,
    };
};
const summarizeDailySchedule = (timeZone, alarmsEnabled, side, scheduleDay, dailySchedule, summary) => {
    if (dailySchedule.power.enabled) {
        const powerOnDayIndex = getDayOfWeekIndex(scheduleDay);
        summary.nextPowerOn = earlierEvent(summary.nextPowerOn, buildScheduleEvent(timeZone, 'power_on', side, scheduleDay, powerOnDayIndex, dailySchedule.power.on, dailySchedule.power.onTemperature));
        const powerOffDayIndex = getDayIndexForSchedule(scheduleDay, dailySchedule.power.off);
        summary.nextPowerOff = earlierEvent(summary.nextPowerOff, buildScheduleEvent(timeZone, 'power_off', side, scheduleDay, powerOffDayIndex, dailySchedule.power.off));
    }
    const alarmDayIndex = getDayIndexForSchedule(scheduleDay, dailySchedule.power.off);
    dailyAlarmSchedules(dailySchedule).forEach((alarm, alarmIndex) => {
        if (!alarmsEnabled)
            return;
        if (!alarm.enabled)
            return;
        summary.nextAlarm = earlierEvent(summary.nextAlarm, buildScheduleEvent(timeZone, 'alarm', side, scheduleDay, alarmDayIndex, alarm.time, alarm.alarmTemperature, alarmIndex));
    });
    Object.entries(dailySchedule.temperatures).forEach(([time, temperatureF]) => {
        const temperatureDayIndex = getDayIndexForSchedule(scheduleDay, time);
        summary.nextTemperatureAdjustment = earlierEvent(summary.nextTemperatureAdjustment, buildScheduleEvent(timeZone, 'temperature', side, scheduleDay, temperatureDayIndex, time, temperatureF));
    });
};
const summarizeSideSchedule = (schedules, settings, side) => {
    const summary = emptySideScheduleSummary();
    if (settings[side].awayMode)
        return summary;
    Object.entries(schedules[side]).forEach(([scheduleDay, dailySchedule]) => {
        summarizeDailySchedule(settings.timeZone, settings[side].alarmsEnabled, side, scheduleDay, dailySchedule, summary);
    });
    const alarmOverride = buildAlarmOverrideEvent(settings, side);
    if (settings[side].alarmsEnabled && alarmOverride)
        summary.nextAlarm = alarmOverride;
    return summary;
};
export const buildScheduleSummary = (schedules, settings) => ({
    left: summarizeSideSchedule(schedules, settings, 'left'),
    right: summarizeSideSchedule(schedules, settings, 'right'),
});
export const scheduleEventState = (event) => event?.timestamp ?? null;
export const scheduleEventAttributes = (event) => event || {};
export const SCHEDULE_SUMMARY_KEYS = [
    'nextPowerOn',
    'nextPowerOff',
    'nextAlarm',
    'nextTemperatureAdjustment',
];
export const SCHEDULE_SUMMARY_LABELS = {
    nextPowerOn: 'Next Power On',
    nextPowerOff: 'Next Power Off',
    nextAlarm: 'Next Alarm',
    nextTemperatureAdjustment: 'Next Temperature Adjustment',
};
//# sourceMappingURL=scheduleSummary.js.map