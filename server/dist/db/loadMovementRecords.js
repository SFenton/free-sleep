
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="47a50504-a32c-51dc-b656-7977ecd11187")}catch(e){}}();
import settingsDB from './settings.js';
import moment from 'moment-timezone';
export const loadMovementRecords = async (movementRecords) => {
    await settingsDB.read();
    const userTimeZone = settingsDB.data.timeZone || 'UTC';
    // Parse JSON fields
    return movementRecords.map((record) => ({
        ...record,
        timestamp: moment.tz(record.timestamp * 1000, userTimeZone).format(),
    }));
};
//# sourceMappingURL=loadMovementRecords.js.map
//# debugId=47a50504-a32c-51dc-b656-7977ecd11187
