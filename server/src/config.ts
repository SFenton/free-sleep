import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import logger from './logger.js';
import { generateDeterministicPodId, generateRandomPodId } from './mqtt/podIdWords.js';


function checkIfDacSockPathConfigured(): string | undefined {
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
  } catch (error) {
    logger.error(error);
  }
}


type FirmwareVersion = 'pod3FirmwareReset' | 'pod4FirmwareReset' | 'remoteDevMode';

interface FirmwareConfig {
  dacLocation: string;
}

interface MqttConfig {
  enabled: boolean;
  url: string;
  username?: string;
  password?: string;
  deviceId: string;
  clientId: string;
  topicPrefix: string;
  discovery: boolean;
  discoveryPrefix: string;
  pollIntervalMs: number;
}

type MqttEnv = Record<string, string | undefined>;

const FIRMWARE_MAP: Record<FirmwareVersion, FirmwareConfig> = {
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

export function normalizeMqttDeviceId(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const words = trimmed.match(/[A-Za-z0-9]+/g);
  if (!words?.length) return undefined;

  const normalized = words.map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join('');
  return normalized || undefined;
}

export const normalizeMqttTopicPrefix = (value: string) => value.replace(/^\/+|\/+$/g, '');


class Config {
  // eslint-disable-next-line no-use-before-define
  private static instance: Config;
  public dbFolder: string;
  public lowDbFolder: string;
  public remoteDevMode: boolean;
  public dacSockPath: string;
  public mqtt: MqttConfig;

  private constructor() {
    if (!process.env.DATA_FOLDER || !process.env.ENV) {
      throw new Error('Missing DATA_FOLDER || ENV in env');
    }
    this.remoteDevMode = process.env.ENV === 'local';
    this.dacSockPath = this.detectSockPath();
    this.dbFolder = process.env.DATA_FOLDER;
    this.lowDbFolder = `${this.dbFolder}lowdb/`;
    this.mqtt = this.loadMqttConfig();
  }


  private detectSockPath(): string {
    const dacSockPath = checkIfDacSockPathConfigured();

    if (dacSockPath) {
      logger.debug(`'Custom dac.sock path configured, using ${dacSockPath}`);
      return dacSockPath;
    } else if (!this.remoteDevMode){
      logger.debug('No dac.sock path configured, defaulting to pod 3 path');
      return FIRMWARE_MAP.pod3FirmwareReset.dacLocation;

    } else if (this.remoteDevMode) {
      return FIRMWARE_MAP.remoteDevMode.dacLocation;
    } else {
      throw new Error('Error - Did not detect device firmware');
    }
  }

  private parseBoolean(value: string | undefined, defaultValue: boolean) {
    if (value === undefined) return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }

  private parsePositiveInteger(value: string | undefined, defaultValue: number) {
    if (value === undefined) return defaultValue;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  }

  private readFirstLine(filePath: string): string | undefined {
    if (!existsSync(filePath)) return undefined;
    try {
      return readFileSync(filePath, 'utf8').split(/\r?\n/)[0];
    } catch (error) {
      logger.warn(`Unable to read ${filePath}: ${error}`);
      return undefined;
    }
  }

  private readPersistedSettingsId(): string | undefined {
    const settingsPath = `${process.env.DATA_FOLDER}/lowdb/settingsDB.json`;
    if (!existsSync(settingsPath)) return undefined;
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as { id?: unknown };
      return typeof settings.id === 'string' ? settings.id : undefined;
    } catch (error) {
      logger.warn(`Unable to read MQTT device id from settings DB: ${error}`);
      return undefined;
    }
  }

  private loadMqttDeviceId(readEnv: (key: string) => string | undefined): string {
    const persistedDeviceIdFile = `${process.env.DATA_FOLDER}/mqtt_device_id.txt`;
    const configuredDeviceId = readEnv('MQTT_DEVICE_ID');
    const normalizedConfiguredDeviceId = configuredDeviceId ? normalizeMqttDeviceId(configuredDeviceId) : undefined;
    if (normalizedConfiguredDeviceId) return normalizedConfiguredDeviceId;

    const persistedDeviceId = this.readFirstLine(persistedDeviceIdFile);
    const normalizedPersistedDeviceId = persistedDeviceId ? normalizeMqttDeviceId(persistedDeviceId) : undefined;
    if (normalizedPersistedDeviceId) {
      if (normalizedPersistedDeviceId !== persistedDeviceId) {
        try {
          writeFileSync(persistedDeviceIdFile, normalizedPersistedDeviceId);
        } catch (error) {
          logger.warn(`Unable to update persisted MQTT device id format: ${error}`);
        }
      }
      return normalizedPersistedDeviceId;
    }

    const generatedDeviceId = generateRandomPodId();
    try {
      const dataFolder = process.env.DATA_FOLDER;
      if (!dataFolder) throw new Error('Missing DATA_FOLDER');
      mkdirSync(dataFolder, { recursive: true });
      writeFileSync(persistedDeviceIdFile, generatedDeviceId);
      return generatedDeviceId;
    } catch (error) {
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
      if (candidate) return generateDeterministicPodId(candidate);
    }

    return generatedDeviceId;
  }

  private stripEnvValueQuotes(value: string) {
    const trimmed = value.trim();
    const startsAndEndsWithDoubleQuotes = trimmed.startsWith('"') && trimmed.endsWith('"');
    const startsAndEndsWithSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");
    if (trimmed.length >= 2 && (startsAndEndsWithDoubleQuotes || startsAndEndsWithSingleQuotes)) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  private loadMqttEnvFile(): MqttEnv {
    const mqttConfigFile = process.env.MQTT_CONFIG_FILE || `${process.env.DATA_FOLDER}/mqtt.env`;
    if (!existsSync(mqttConfigFile)) return {};

    const env: MqttEnv = {};
    const fileContents = readFileSync(mqttConfigFile, 'utf8');
    fileContents.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

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

  private loadMqttConfig(): MqttConfig {
    const mqttEnv = this.loadMqttEnvFile();
    const readEnv = (key: string) => mqttEnv[key] ?? process.env[key];
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

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }
}

export default Config.getInstance();
