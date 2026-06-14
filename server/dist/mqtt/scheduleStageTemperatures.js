export const SCHEDULE_TEMPERATURE_STAGE_KEYS = ['bedtime', 'asleep', 'dawn'];
export const SCHEDULE_TEMPERATURE_STAGE_LABELS = {
    bedtime: 'Bedtime Temperature',
    asleep: 'Asleep Temperature',
    dawn: 'Dawn Temperature',
};
export const SCHEDULE_TEMPERATURE_STAGE_COMMANDS = {
    bedtimeTemperatureF: 'bedtime',
    asleepTemperatureF: 'asleep',
    dawnTemperatureF: 'dawn',
};
export const SCHEDULE_DAYS = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
];
const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};
const minutesToTime = (minutes) => {
    const normalized = ((minutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalized / 60);
    const remainingMinutes = normalized % 60;
    return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
};
const defaultAsleepTime = (schedule) => minutesToTime(timeToMinutes(schedule.power.on) + 60);
const defaultDawnTime = (schedule) => minutesToTime(timeToMinutes(schedule.power.off) - 60);
const sortedTemperatureEntries = (schedule) => {
    const powerOnMinutes = timeToMinutes(schedule.power.on);
    return Object.entries(schedule.temperatures)
        .sort(([timeA], [timeB]) => {
        const adjustedA = (timeToMinutes(timeA) - powerOnMinutes + 1440) % 1440;
        const adjustedB = (timeToMinutes(timeB) - powerOnMinutes + 1440) % 1440;
        return adjustedA - adjustedB;
    });
};
export function scheduleTemperatureStageValue(schedule, stage) {
    if (stage === 'bedtime')
        return schedule.power.onTemperature;
    const entries = sortedTemperatureEntries(schedule);
    if (stage === 'asleep')
        return entries[0]?.[1] ?? null;
    if (entries.length < 2)
        return null;
    return entries[entries.length - 1]?.[1] ?? null;
}
function buildSideScheduleTemperatureStageStates(schedules, side) {
    const stages = {};
    for (const stage of SCHEDULE_TEMPERATURE_STAGE_KEYS) {
        const values = SCHEDULE_DAYS.map(day => scheduleTemperatureStageValue(schedules[side][day], stage));
        const first = values[0];
        stages[stage] = typeof first === 'number' && values.every(value => value === first) ? first : null;
    }
    return stages;
}
export function buildScheduleTemperatureStageStates(schedules) {
    return {
        left: buildSideScheduleTemperatureStageStates(schedules, 'left'),
        right: buildSideScheduleTemperatureStageStates(schedules, 'right'),
    };
}
export function buildScheduleTemperatureStageUpdate(schedules, side, stage, temperatureF) {
    const sideUpdate = {};
    for (const day of SCHEDULE_DAYS) {
        const schedule = schedules[side][day];
        if (stage === 'bedtime') {
            sideUpdate[day] = { power: { onTemperature: temperatureF } };
            continue;
        }
        const temperatures = { ...schedule.temperatures };
        const entries = sortedTemperatureEntries(schedule);
        const selectedTime = stage === 'asleep'
            ? entries[0]?.[0] ?? defaultAsleepTime(schedule)
            : entries.length > 1 ? entries[entries.length - 1]?.[0] ?? defaultDawnTime(schedule) : defaultDawnTime(schedule);
        temperatures[selectedTime] = temperatureF;
        sideUpdate[day] = { temperatures };
    }
    return { [side]: sideUpdate };
}
//# sourceMappingURL=scheduleStageTemperatures.js.map