import { SCHEDULE_DAYS } from './scheduleStageTemperatures.js';
export const SCHEDULE_BEDTIME_COMMAND = 'bedtime';
export const SCHEDULE_BEDTIME_LABEL = 'Bedtime';
const MINUTES_PER_DAY = 24 * 60;
const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};
const minutesToTime = (minutes) => {
    const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const hours = Math.floor(normalized / 60);
    const remainingMinutes = normalized % 60;
    return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
};
const dailyBedtime = (schedule) => schedule.power.on;
const sideBedtime = (schedules, side) => {
    const values = SCHEDULE_DAYS.map(day => dailyBedtime(schedules[side][day]));
    const first = values[0];
    return values.every(value => value === first) ? first : null;
};
export function buildScheduleBedtimeStates(schedules) {
    return {
        left: sideBedtime(schedules, 'left'),
        right: sideBedtime(schedules, 'right'),
    };
}
export function buildScheduleBedtimeUpdate(side, bedtime) {
    const sideUpdate = {};
    for (const day of SCHEDULE_DAYS) {
        sideUpdate[day] = { power: { on: bedtime } };
    }
    return { [side]: sideUpdate };
}
export function primeTimeFromBedtimes(schedules) {
    const earliestBedtimeMinutes = Math.min(...SCHEDULE_DAYS.flatMap(day => [
        timeToMinutes(schedules.left[day].power.on),
        timeToMinutes(schedules.right[day].power.on),
    ]));
    return minutesToTime(earliestBedtimeMinutes - 60);
}
export function buildPrimeTimeSettingsUpdate(schedules) {
    return { primePodDaily: { time: primeTimeFromBedtimes(schedules) } };
}
//# sourceMappingURL=scheduleBedtimes.js.map