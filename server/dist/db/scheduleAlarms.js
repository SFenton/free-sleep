export function dailyAlarmSchedules(dailySchedule) {
    if (dailySchedule.alarms.length > 0)
        return dailySchedule.alarms;
    return dailySchedule.alarm.enabled ? [dailySchedule.alarm] : [];
}
//# sourceMappingURL=scheduleAlarms.js.map