import { DeepPartial } from 'ts-essentials';
import { DailySchedule, DayOfWeek, Schedules, Side, Time } from '../db/schedulesSchema.js';

export const SCHEDULE_TEMPERATURE_STAGE_KEYS = ['bedtime', 'asleep', 'dawn'] as const;

// eslint-disable-next-line @typescript-eslint/no-type-alias
export type ScheduleTemperatureStage = (typeof SCHEDULE_TEMPERATURE_STAGE_KEYS)[number];

export const SCHEDULE_TEMPERATURE_STAGE_LABELS = {
  bedtime: 'Bedtime Temperature',
  asleep: 'Asleep Temperature',
  dawn: 'Dawn Temperature',
} satisfies Record<ScheduleTemperatureStage, string>;

export const SCHEDULE_TEMPERATURE_STAGE_COMMANDS: Record<string, ScheduleTemperatureStage> = {
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
] as const satisfies readonly DayOfWeek[];

const timeToMinutes = (time: Time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes: number): Time => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const remainingMinutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}` as Time;
};

const defaultAsleepTime = (schedule: DailySchedule) => minutesToTime(timeToMinutes(schedule.power.on) + 60);
const defaultDawnTime = (schedule: DailySchedule) => minutesToTime(timeToMinutes(schedule.power.off) - 60);

const sortedTemperatureEntries = (schedule: DailySchedule) => {
  const powerOnMinutes = timeToMinutes(schedule.power.on);
  return (Object.entries(schedule.temperatures) as [Time, number][])
    .sort(([timeA], [timeB]) => {
      const adjustedA = (timeToMinutes(timeA) - powerOnMinutes + 1440) % 1440;
      const adjustedB = (timeToMinutes(timeB) - powerOnMinutes + 1440) % 1440;
      return adjustedA - adjustedB;
    });
};

export function scheduleTemperatureStageValue(schedule: DailySchedule, stage: ScheduleTemperatureStage): number | null {
  if (stage === 'bedtime') return schedule.power.onTemperature;

  const entries = sortedTemperatureEntries(schedule);
  if (stage === 'asleep') return entries[0]?.[1] ?? null;
  if (entries.length < 2) return null;
  return entries[entries.length - 1]?.[1] ?? null;
}

function buildSideScheduleTemperatureStageStates(schedules: Schedules, side: Side): Record<ScheduleTemperatureStage, number | null> {
  const stages = {} as Record<ScheduleTemperatureStage, number | null>;

  for (const stage of SCHEDULE_TEMPERATURE_STAGE_KEYS) {
    const values = SCHEDULE_DAYS.map(day => scheduleTemperatureStageValue(schedules[side][day], stage));
    const first = values[0];
    stages[stage] = typeof first === 'number' && values.every(value => value === first) ? first : null;
  }

  return stages;
}

export function buildScheduleTemperatureStageStates(schedules: Schedules): Record<Side, Record<ScheduleTemperatureStage, number | null>> {
  return {
    left: buildSideScheduleTemperatureStageStates(schedules, 'left'),
    right: buildSideScheduleTemperatureStageStates(schedules, 'right'),
  };
}

export function buildScheduleTemperatureStageUpdate(
  schedules: Schedules,
  side: Side,
  stage: ScheduleTemperatureStage,
  temperatureF: number,
): DeepPartial<Schedules> {
  const sideUpdate: DeepPartial<Schedules[Side]> = {};

  for (const day of SCHEDULE_DAYS) {
    const schedule = schedules[side][day];
    if (stage === 'bedtime') {
      sideUpdate[day] = { power: { onTemperature: temperatureF } } as Partial<DailySchedule>;
      continue;
    }

    const temperatures = { ...schedule.temperatures };
    const entries = sortedTemperatureEntries(schedule);
    const selectedTime = stage === 'asleep'
      ? entries[0]?.[0] ?? defaultAsleepTime(schedule)
      : entries.length > 1 ? entries[entries.length - 1]?.[0] ?? defaultDawnTime(schedule) : defaultDawnTime(schedule);
    temperatures[selectedTime] = temperatureF;
    sideUpdate[day] = { temperatures } as Partial<DailySchedule>;
  }

  return { [side]: sideUpdate } as DeepPartial<Schedules>;
}
