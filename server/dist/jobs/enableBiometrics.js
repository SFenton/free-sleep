import logger from '../logger.js';
import { exec } from 'child_process';
export const enableBiometrics = () => {
    logger.info('Attempting to enable biometrics...');
    const scriptPath = '/home/dac/free-sleep/scripts/enable_biometrics.sh';
    const command = `bash ${scriptPath}`;
    // Run the shell script asynchronously
    exec(command, { env: { ...process.env } }, (error, stdout, stderr) => {
        if (error) {
            logger.error(`Enabling biometrics error: ${error.message}`);
            return;
        }
        if (stderr) {
            logger.error(`Enabling biometrics error: ${stderr.trim()}`);
        }
        if (stdout) {
            logger.info(`Enabling biometrics stdout: ${stdout.trim()}`);
        }
    });
};
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="043810bc-76ea-5110-8418-52777ee0bd12")}catch(e){}}();
//# debugId=043810bc-76ea-5110-8418-52777ee0bd12
