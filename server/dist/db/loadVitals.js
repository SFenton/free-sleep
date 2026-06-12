
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="6a909daf-4dc2-552c-a962-8a4316e9cd26")}catch(e){}}();
import settingsDB from './settings.js';
import moment from 'moment-timezone';
export const loadVitals = async (vitalRecords) => {
    await settingsDB.read();
    const userTimeZone = settingsDB.data.timeZone || 'UTC';
    return vitalRecords.map((vital) => ({
        ...vital,
        timestamp: moment.tz(vital.timestamp * 1000, userTimeZone).format(),
    }));
};
//# sourceMappingURL=loadVitals.js.map
//# debugId=6a909daf-4dc2-552c-a962-8a4316e9cd26
