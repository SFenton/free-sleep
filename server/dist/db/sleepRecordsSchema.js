
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="d28980fc-691d-5fcc-aaff-0af7dd9f8da7")}catch(e){}}();
import { z } from 'zod';
export const sleepRecordSchema = z.object({
    id: z.number().int(),
    side: z.string(),
    entered_bed_at: z.string().datetime(),
    left_bed_at: z.string().datetime(),
    sleep_period_seconds: z.number().int(),
    times_exited_bed: z.number().int(),
    present_intervals: z.array(z.tuple([z.string().datetime(), z.string().datetime()])),
    not_present_intervals: z.array(z.tuple([z.string().datetime(), z.string().datetime()])),
});
//# sourceMappingURL=sleepRecordsSchema.js.map
//# debugId=d28980fc-691d-5fcc-aaff-0af7dd9f8da7
