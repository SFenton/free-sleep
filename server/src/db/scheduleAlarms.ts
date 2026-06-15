import { AlarmSchedule, DailySchedule } from './schedulesSchema.js';

export function dailyAlarmSchedules(dailySchedule: DailySchedule): AlarmSchedule[] {
  if (dailySchedule.alarms.length > 0) return dailySchedule.alarms;
  return dailySchedule.alarm.enabled ? [dailySchedule.alarm] : [];
}
