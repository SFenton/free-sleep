
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="92befc3e-80f5-5991-8fa5-5b4b2f645cae")}catch(e){}}();
import { spawn } from 'child_process';
import logger from '../logger.js';
export default function update() {
    logger.debug('Updating free-sleep...');
    const child = spawn('sudo', ['/bin/systemctl', 'start', 'free-sleep-update.service', '--no-block'], {
        stdio: 'ignore',
        detached: true,
    });
    child.unref();
}
//# sourceMappingURL=update.js.map
//# debugId=92befc3e-80f5-5991-8fa5-5b4b2f645cae
