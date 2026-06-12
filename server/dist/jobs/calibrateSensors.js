
!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="ce63dcd3-9049-5b9c-a6c6-b46c5fac8ff2")}catch(e){}}();
import { executePythonScript } from './executePython.js';
export const executeCalibrateSensors = (side, startTime, endTime) => {
    executePythonScript({
        script: '/home/dac/free-sleep/biometrics/sleep_detection/calibrate_sensor_thresholds.py',
        args: [
            `--side=${side}`,
            `--start_time=${startTime}`,
            `--end_time=${endTime}`
        ]
    });
};
//# sourceMappingURL=calibrateSensors.js.map
//# debugId=ce63dcd3-9049-5b9c-a6c6-b46c5fac8ff2
