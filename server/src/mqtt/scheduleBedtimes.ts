import { DeepPartial } from 'ts-essentials';
import { DailySchedule, Schedules, Side, Time } from '../db/schedulesSchema.js';
import { Settings } from '../db/settingsSchema.js';
import { SCHEDULE_DAYS } from './scheduleStageTemperatures.js';

export const SCHEDULE_BEDTIME_COMMAND = 'bedtime';
export const SCHEDULE_BEDTIME_LABEL = 'Bedtime';

const MINUTES_PER_DAY = 24 * 60;

const timeToMinutes = (time: Time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes: number): Time => {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const remainingMinutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}` as Time;
};

const dailyBedtime = (schedule: DailySchedule) => schedule.power.on;

const sideBedtime = (schedules: Schedules, side: Side): Time | null => {
  const values = SCHEDULE_DAYS.map(day => dailyBedtime(schedules[side][day]));
  const first = values[0];
  return values.every(value => value === first) ? first : null;
};

export function buildScheduleBedtimeStates(schedules: Schedules): Record<Side, Time | null> {
  return {
    left: sideBedtime(schedules, 'left'),
    right: sideBedtime(schedules, 'right'),
  };
}

export function buildScheduleBedtimeUpdate(
  side: Side,
  bedtime: Time,
): DeepPartial<Schedules> {
  const sideUpdate: DeepPartial<Schedules[Side]> = {};

  for (const day of SCHEDULE_DAYS) {
    sideUpdate[day] = { power: { on: bedtime } } as Partial<DailySchedule>;
  }

  return { [side]: sideUpdate } as DeepPartial<Schedules>;
}

export function primeTimeFromBedtimes(schedules: Schedules): Time {
  const earliestBedtimeMinutes = Math.min(
    ...SCHEDULE_DAYS.flatMap(day => [
      timeToMinutes(schedules.left[day].power.on),
      timeToMinutes(schedules.right[day].power.on),
    ]),
  );

  return minutesToTime(earliestBedtimeMinutes - 60);
}

export function buildPrimeTimeSettingsUpdate(schedules: Schedules): DeepPartial<Settings> {
  return { primePodDaily: { time: primeTimeFromBedtimes(schedules) } };
}
