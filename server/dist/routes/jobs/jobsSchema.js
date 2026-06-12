
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="7415a464-18c8-54bc-ad4f-d88b7dbed522")}catch(e){}}();
import { z } from 'zod';
export const JobSchema = z.enum([
    'analyzeSleepLeft',
    'analyzeSleepRight',
    'biometricsCalibrationLeft',
    'biometricsCalibrationRight',
    'reboot',
    'update',
]);
// Schema for a list (array) of valid job keys
export const JobKeyListSchema = z.array(JobSchema);
//# sourceMappingURL=jobsSchema.js.map
//# debugId=7415a464-18c8-54bc-ad4f-d88b7dbed522
