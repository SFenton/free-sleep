import { spawn } from 'child_process';
import logger from '../logger.js';
export default function repairBiometricsSources() {
    logger.debug('Repairing biometrics source services...');
    const child = spawn('sudo', ['/bin/sh', '/home/dac/free-sleep/scripts/repair_biometrics_sources.sh'], {
        stdio: 'ignore',
        detached: true,
    });
    child.unref();
}
//# sourceMappingURL=repairBiometricsSources.js.map