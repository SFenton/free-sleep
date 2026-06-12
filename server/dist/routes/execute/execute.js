
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="8c5336d6-4f37-5233-81a6-15bba1c7cd07")}catch(e){}}();
import express from 'express';
import { frankenCommands, executeFunction } from '../../8sleep/deviceApi.js';
const router = express.Router();
router.post('/execute', async (req, res) => {
    const { command, arg } = req.body;
    // Basic validation
    if (!Object.keys(frankenCommands).includes(command)) {
        res.status(400).send('Invalid command');
        return;
    }
    // Execute the 8sleep command
    await executeFunction(command, arg || 'empty');
    // Respond with success
    res.json({ success: true, message: `Command '${command}' executed successfully.` });
    return;
});
export default router;
//# sourceMappingURL=execute.js.map
//# debugId=8c5336d6-4f37-5233-81a6-15bba1c7cd07
