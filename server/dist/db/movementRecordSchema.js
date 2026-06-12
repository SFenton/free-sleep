
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="413c0f49-f774-51f7-ba36-e23d1019e7a5")}catch(e){}}();
import { z } from 'zod';
import { SideSchema } from './schedulesSchema.js';
export const movementRecordSchema = z.object({
    id: z.number(),
    side: SideSchema,
    timestamp: z.number().int(), // Epoch timestamp
    total_movement: z.number().int()
});
//# sourceMappingURL=movementRecordSchema.js.map
//# debugId=413c0f49-f774-51f7-ba36-e23d1019e7a5
