import { spawn } from 'child_process';
import logger from '../logger.js';

export default function enableBiometrics() {
  logger.debug('Enabling biometrics...');
  const child = spawn('sudo', ['/bin/sh', '/home/dac/free-sleep/scripts/enable_biometrics.sh'], {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
}
