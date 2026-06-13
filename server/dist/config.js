import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import logger from './logger.js';
import { generateDeterministicPodId, generateRandomPodId } from './mqtt/podIdWords.js';
function checkIfDacSockPathConfigured() {
    try {
        // Check if the file exists
        const filePath = '/persistent/free-sleep-data/dac_sock_path.txt';
        if (!existsSync(filePath)) {
            logger.debug(`dac.sock path not configured, defaulting to pod 3 path...`);
            return;
        }
        const data = readFileSync(filePath, 'utf8');
        // Remove all newline characters
        return data.replace(/\r?\n/g, '');
    }
    catch (error) {
        logger.error(error);
    }
}
const FIRMWARE_MAP = {
    remoteDevMode: {
        dacLocation: `${process.env.DATA_FOLDER}/dac.sock`,
    },
    pod3FirmwareReset: {
        dacLocation: '/deviceinfo/dac.sock',
    },
    pod4FirmwareReset: {
        dacLocation: '/persistent/deviceinfo/dac.sock',
    },
};
export function normalizeMqttDeviceId(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return undefined;
    const words = trimmed.match(/[A-Za-z0-9]+/g);
    if (!words?.length)
        return undefined;
    const normalized = words.map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join('');
    return normalized || undefined;
}
export const normalizeMqttTopicPrefix = (value) => value.replace(/^\/+|\/+$/g, '');
class Config {
    // eslint-disable-next-line no-use-before-define
    static instance;
    dbFolder;
    lowDbFolder;
    remoteDevMode;
    dacSockPath;
    mqtt;
    constructor() {
        if (!process.env.DATA_FOLDER || !process.env.ENV) {
            throw new Error('Missing DATA_FOLDER || ENV in env');
        }
        this.remoteDevMode = process.env.ENV === 'local';
        this.dacSockPath = this.detectSockPath();
        this.dbFolder = process.env.DATA_FOLDER;
        this.lowDbFolder = `${this.dbFolder}lowdb/`;
        this.mqtt = this.loadMqttConfig();
    }
    detectSockPath() {
        const dacSockPath = checkIfDacSockPathConfigured();
        if (dacSockPath) {
            logger.debug(`'Custom dac.sock path configured, using ${dacSockPath}`);
            return dacSockPath;
        }
        else if (!this.remoteDevMode) {
            logger.debug('No dac.sock path configured, defaulting to pod 3 path');
            return FIRMWARE_MAP.pod3FirmwareReset.dacLocation;
        }
        else if (this.remoteDevMode) {
            return FIRMWARE_MAP.remoteDevMode.dacLocation;
        }
        else {
            throw new Error('Error - Did not detect device firmware');
        }
    }
    parseBoolean(value, defaultValue) {
        if (value === undefined)
            return defaultValue;
        return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    }
    parsePositiveInteger(value, defaultValue) {
        if (value === undefined)
            return defaultValue;
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
    }
    readFirstLine(filePath) {
        if (!existsSync(filePath))
            return undefined;
        try {
            return readFileSync(filePath, 'utf8').split(/\r?\n/)[0];
        }
        catch (error) {
            logger.warn(`Unable to read ${filePath}: ${error}`);
            return undefined;
        }
    }
    readPersistedSettingsId() {
        const settingsPath = `${process.env.DATA_FOLDER}/lowdb/settingsDB.json`;
        if (!existsSync(settingsPath))
            return undefined;
        try {
            const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
            return typeof settings.id === 'string' ? settings.id : undefined;
        }
        catch (error) {
            logger.warn(`Unable to read MQTT device id from settings DB: ${error}`);
            return undefined;
        }
    }
    loadMqttDeviceId(readEnv) {
        const persistedDeviceIdFile = `${process.env.DATA_FOLDER}/mqtt_device_id.txt`;
        const configuredDeviceId = readEnv('MQTT_DEVICE_ID');
        const normalizedConfiguredDeviceId = configuredDeviceId ? normalizeMqttDeviceId(configuredDeviceId) : undefined;
        if (normalizedConfiguredDeviceId)
            return normalizedConfiguredDeviceId;
        const persistedDeviceId = this.readFirstLine(persistedDeviceIdFile);
        const normalizedPersistedDeviceId = persistedDeviceId ? normalizeMqttDeviceId(persistedDeviceId) : undefined;
        if (normalizedPersistedDeviceId) {
            if (normalizedPersistedDeviceId !== persistedDeviceId) {
                try {
                    writeFileSync(persistedDeviceIdFile, normalizedPersistedDeviceId);
                }
                catch (error) {
                    logger.warn(`Unable to update persisted MQTT device id format: ${error}`);
                }
            }
            return normalizedPersistedDeviceId;
        }
        const generatedDeviceId = generateRandomPodId();
        try {
            const dataFolder = process.env.DATA_FOLDER;
            if (!dataFolder)
                throw new Error('Missing DATA_FOLDER');
            mkdirSync(dataFolder, { recursive: true });
            writeFileSync(persistedDeviceIdFile, generatedDeviceId);
            return generatedDeviceId;
        }
        catch (error) {
            logger.warn(`Unable to persist generated MQTT device id: ${error}`);
        }
        const candidates = [
            this.readFirstLine('/deviceinfo/device-label'),
            this.readFirstLine('/persistent/deviceinfo/device-label'),
            this.readPersistedSettingsId(),
            this.readFirstLine('/etc/machine-id'),
            this.readFirstLine('/proc/sys/kernel/hostname'),
        ];
        for (const candidate of candidates) {
            if (candidate)
                return generateDeterministicPodId(candidate);
        }
        return generatedDeviceId;
    }
    stripEnvValueQuotes(value) {
        const trimmed = value.trim();
        const startsAndEndsWithDoubleQuotes = trimmed.startsWith('"') && trimmed.endsWith('"');
        const startsAndEndsWithSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");
        if (trimmed.length >= 2 && (startsAndEndsWithDoubleQuotes || startsAndEndsWithSingleQuotes)) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    }
    loadMqttEnvFile() {
        const mqttConfigFile = process.env.MQTT_CONFIG_FILE || `${process.env.DATA_FOLDER}/mqtt.env`;
        if (!existsSync(mqttConfigFile))
            return {};
        const env = {};
        const fileContents = readFileSync(mqttConfigFile, 'utf8');
        fileContents.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                return;
            const equalsIndex = trimmed.indexOf('=');
            if (equalsIndex <= 0) {
                logger.warn(`Ignoring malformed MQTT env line in ${mqttConfigFile}: ${trimmed}`);
                return;
            }
            const key = trimmed.slice(0, equalsIndex).trim();
            env[key] = this.stripEnvValueQuotes(trimmed.slice(equalsIndex + 1));
        });
        return env;
    }
    loadMqttConfig() {
        const mqttEnv = this.loadMqttEnvFile();
        const readEnv = (key) => mqttEnv[key] ?? process.env[key];
        const deviceId = this.loadMqttDeviceId(readEnv);
        const configuredTopicPrefix = readEnv('MQTT_TOPIC_PREFIX');
        const topicPrefix = configuredTopicPrefix || `free-sleep/${deviceId}`;
        const defaultClientId = `free-sleep-${deviceId}`;
        const enabledByUrl = Boolean(readEnv('MQTT_URL'));
        return {
            enabled: this.parseBoolean(readEnv('MQTT_ENABLED'), enabledByUrl),
            url: readEnv('MQTT_URL') || '',
            username: readEnv('MQTT_USERNAME'),
            password: readEnv('MQTT_PASSWORD'),
            deviceId,
            clientId: readEnv('MQTT_CLIENT_ID') || defaultClientId,
            topicPrefix: normalizeMqttTopicPrefix(topicPrefix),
            discovery: this.parseBoolean(readEnv('MQTT_HOME_ASSISTANT_DISCOVERY'), true),
            discoveryPrefix: normalizeMqttTopicPrefix(readEnv('MQTT_HOME_ASSISTANT_DISCOVERY_PREFIX') || 'homeassistant'),
            pollIntervalMs: this.parsePositiveInteger(readEnv('MQTT_POLL_INTERVAL_MS'), 30_000),
        };
    }
    static getInstance() {
        if (!Config.instance) {
            Config.instance = new Config();
        }
        return Config.instance;
    }
}
export default Config.getInstance();
//# sourceMappingURL=config.js.map