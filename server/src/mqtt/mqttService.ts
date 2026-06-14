import path from 'path';
import chokidar from 'chokidar';
import mqtt, { IClientOptions, MqttClient } from 'mqtt';
import _ from 'lodash';
import { DeepPartial } from 'ts-essentials';
import config, { normalizeMqttDeviceId, normalizeMqttTopicPrefix } from '../config.js';
import logger from '../logger.js';
import serverStatus from '../serverStatus.js';
import settingsDB from '../db/settings.js';
import schedulesDB from '../db/schedules.js';
import servicesDB from '../db/services.js';
import mqttSettingsDB from '../db/mqttSettings.js';
import { MqttSettings } from '../db/mqttSettingsSchema.js';
import { Settings as AppSettings } from '../db/settingsSchema.js';
import { Side, SideSchema } from '../db/schedulesSchema.js';
import { DeviceStatus, DeviceStatusSchema } from '../routes/deviceStatus/deviceStatusSchema.js';
import { updateDeviceStatus } from '../routes/deviceStatus/updateDeviceStatus.js';
import { updateSettings } from '../routes/settings/settings.js';
import { updateSchedules } from '../routes/schedules/schedules.js';
import { updateServices } from '../routes/services/services.js';
import { getPresenceData, updatePresenceData } from '../routes/metrics/presence.js';
import { connectFranken } from '../8sleep/frankenServer.js';
import { executeFunction, frankenCommands, FrankenCommand } from '../8sleep/deviceApi.js';
import { executeAlarm } from '../jobs/alarmScheduler.js';
import { AlarmJobSchema } from '../db/schedulesSchema.js';
import { onMetricsUpdated, onPresenceUpdated, onWifiStrengthUpdated } from '../events/stateUpdateEvents.js';
import {
  loadLatestMovementBySide,
  loadLatestSleepBySide,
  loadLatestVitalsBySide,
  loadMovementData,
  loadSleepData,
  loadVitalsData,
  loadVitalsSummaryData,
  MetricsQuery,
} from '../routes/metrics/metricQueries.js';
import { buildHomeAssistantDiscoveryMessages } from './homeAssistantDiscovery.js';
import { wait } from '../8sleep/promises.js';
import { buildScheduleSummary, scheduleEventAttributes, scheduleEventState, SCHEDULE_SUMMARY_KEYS } from './scheduleSummary.js';
import {
  buildScheduleTemperatureStageStates,
  buildScheduleTemperatureStageUpdate,
  SCHEDULE_TEMPERATURE_STAGE_COMMANDS,
  SCHEDULE_TEMPERATURE_STAGE_KEYS,
  ScheduleTemperatureStage,
} from './scheduleStageTemperatures.js';

type JsonObject = Record<string, unknown>;

interface RequestEnvelope {
  requestId?: string;
  params?: MetricsQuery;
  body?: unknown;
}

const isJsonObject = (value: unknown): value is JsonObject => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const normalizeTopic = (value: string) => value.replace(/^\/+|\/+$/g, '');

const mqttClientId = (settings: MqttSettings) => `free-sleep-${settings.deviceId}`;
const LOWDB_STATE_FILES = new Set(['settingsDB.json', 'schedulesDB.json', 'servicesDB.json']);
const LOWDB_STATE_PUBLISH_DEBOUNCE_MS = 250;

export const normalizeMqttSettings = (settings: MqttSettings): MqttSettings => {
  const deviceId = normalizeMqttDeviceId(settings.deviceId);
  if (settings.enabled && !deviceId) throw new Error('MQTT device ID is required');

  return {
    ...settings,
    url: settings.url.trim(),
    username: settings.username?.trim() || '',
    password: settings.password || '',
    deviceId: deviceId || '',
    topicPrefix: normalizeMqttTopicPrefix(settings.topicPrefix || (deviceId ? `free-sleep/${deviceId}` : '')),
    discoveryPrefix: normalizeMqttTopicPrefix(settings.discoveryPrefix || 'homeassistant'),
  };
};

const coerceBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  }
  throw new Error(`Expected boolean payload, received ${JSON.stringify(value)}`);
};

const coerceNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric payload, received ${JSON.stringify(value)}`);
  }
  return parsed;
};

const parsePayload = (message: Buffer): unknown => {
  const text = message.toString('utf8').trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const parseRequestEnvelope = (payload: unknown): RequestEnvelope => {
  if (!isJsonObject(payload)) return { params: {} };
  return {
    requestId: typeof payload.requestId === 'string' ? payload.requestId : undefined,
    params: isJsonObject(payload.params) ? payload.params : payload as MetricsQuery,
    body: payload.body,
  };
};

const toJsonObject = (payload: unknown): JsonObject => {
  if (!isJsonObject(payload)) {
    throw new Error(`Expected JSON object payload, received ${JSON.stringify(payload)}`);
  }
  return payload;
};

class MqttService {
  private client?: MqttClient;
  private publishInterval?: NodeJS.Timeout;
  private lowDbWatcher?: ReturnType<typeof chokidar.watch>;
  private lowDbStatePublishTimeout?: NodeJS.Timeout;
  private unsubscribeMetricsUpdated?: () => void;
  private unsubscribePresenceUpdated?: () => void;
  private unsubscribeWifiStrengthUpdated?: () => void;
  private isPublishing = false;
  private publishAllStatesRequested = false;
  private settings?: MqttSettings;

  public async start() {
    this.startLowDbWatcher();
    this.startStateUpdateSubscriptions();
    await this.reloadSettings();
  }

  public async reloadSettings() {
    await mqttSettingsDB.read();
    await this.configure(mqttSettingsDB.data);
  }

  public async publishObservedDeviceStatus(deviceStatus: DeviceStatus) {
    await this.runPublisher('observed device status', () => this.publishDeviceStatus(deviceStatus));
  }

  private startLowDbWatcher() {
    if (this.lowDbWatcher) return;

    this.lowDbWatcher = chokidar.watch(config.lowDbFolder, { ignoreInitial: true });
    this.lowDbWatcher.on('change', changedPath => {
      const fileName = path.basename(changedPath);
      if (!LOWDB_STATE_FILES.has(fileName)) return;
      logger.info(`MQTT detected LowDB state change, publishing latest state: ${fileName}`);
      this.queueLowDbStatePublish();
    });
    this.lowDbWatcher.on('error', error => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`MQTT LowDB watcher error: ${message}`);
    });
  }

  private queueLowDbStatePublish() {
    if (this.lowDbStatePublishTimeout) clearTimeout(this.lowDbStatePublishTimeout);
    this.lowDbStatePublishTimeout = setTimeout(() => {
      this.lowDbStatePublishTimeout = undefined;
      void this.publishAllStates();
    }, LOWDB_STATE_PUBLISH_DEBOUNCE_MS);
  }

  private startStateUpdateSubscriptions() {
    if (this.unsubscribeMetricsUpdated || this.unsubscribePresenceUpdated || this.unsubscribeWifiStrengthUpdated) return;

    this.unsubscribeMetricsUpdated = onMetricsUpdated(() => {
      void this.runPublisher('latest metrics', () => this.publishLatestMetrics());
    });
    this.unsubscribePresenceUpdated = onPresenceUpdated(() => {
      void this.runPublisher('presence', () => this.publishPresence());
    });
    this.unsubscribeWifiStrengthUpdated = onWifiStrengthUpdated(signal => {
      void this.runPublisher('wifi strength', () => this.publish('wifiStrength/state', signal, true));
    });
  }

  public async configure(settings: MqttSettings) {
    const mqttSettings = normalizeMqttSettings(settings);

    if (!mqttSettings.enabled) {
      await this.stop();
      this.settings = mqttSettings;
      serverStatus.status.mqtt.status = 'not_started';
      serverStatus.status.mqtt.message = 'MQTT disabled.';
      return;
    }

    if (!mqttSettings.url) {
      await this.stop();
      this.settings = mqttSettings;
      serverStatus.status.mqtt.status = 'failed';
      serverStatus.status.mqtt.message = 'MQTT is enabled but no broker URL is configured.';
      logger.warn(serverStatus.status.mqtt.message);
      return;
    }

    await this.stop();
    this.settings = mqttSettings;
    const options: IClientOptions = {
      clientId: mqttClientId(mqttSettings),
      username: mqttSettings.username || undefined,
      password: mqttSettings.password || undefined,
      clean: true,
      reconnectPeriod: 5_000,
      will: {
        topic: this.fullTopic('status'),
        payload: 'offline',
        retain: true,
        qos: 0,
      },
    };

    this.client = mqtt.connect(mqttSettings.url, options);
    serverStatus.status.mqtt.status = 'started';
    serverStatus.status.mqtt.message = `Connecting to ${mqttSettings.url}`;

    this.client.on('connect', () => void this.handleConnect());
    this.client.on('message', (topic, message) => void this.handleMessage(topic, message));
    this.client.on('reconnect', () => {
      serverStatus.status.mqtt.status = 'retrying';
      serverStatus.status.mqtt.message = `Reconnecting to ${mqttSettings.url}`;
    });
    this.client.on('offline', () => {
      serverStatus.status.mqtt.status = 'retrying';
      serverStatus.status.mqtt.message = 'MQTT broker connection is offline.';
    });
    this.client.on('error', (error) => {
      serverStatus.status.mqtt.status = 'failed';
      serverStatus.status.mqtt.message = error.message;
      logger.error(error);
    });
  }

  public async stop() {
    if (this.publishInterval) clearInterval(this.publishInterval);
    this.publishInterval = undefined;
    if (!this.client) return;
    if (this.client.connected) {
      await this.publish('status', 'offline', true);
    }
    await new Promise<void>((resolve) => this.client?.end(false, {}, () => resolve()));
    this.client = undefined;
  }

  private async handleConnect() {
    const mqttSettings = this.settings;
    if (!mqttSettings) return;

    logger.info(`Connected to MQTT broker at ${mqttSettings.url}`);
    serverStatus.status.mqtt.status = 'healthy';
    serverStatus.status.mqtt.message = '';

    await this.publish('status', 'online', true);
    await this.subscribeCommandTopics();

    if (this.publishInterval) clearInterval(this.publishInterval);
    this.publishInterval = setInterval(() => void this.publishAllStates(), mqttSettings.pollIntervalMs);
    void this.publishAllStates();
  }

  private async subscribeCommandTopics() {
    const client = this.client;
    if (!client) return;
    const topics = [
      'deviceStatus/set',
      'settings/set',
      'schedules/set',
      'services/set',
      'presence/set',
      'alarm/set',
      'execute/set',
      'request/#',
      '+/temperature/set',
      '+/power/set',
      '+/secondsRemaining/set',
      '+/alarmVibration/set',
      '+/awayMode/set',
      '+/schedule/+/set',
      'ledBrightness/set',
      'prime/set',
      'alarm/clear/set',
    ].map(topicPath => this.fullTopic(topicPath));

    await new Promise<void>((resolve, reject) => {
      client.subscribe(topics, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private async handleMessage(topic: string, message: Buffer) {
    const relativeTopic = this.toRelativeTopic(topic);
    if (!relativeTopic) return;

    try {
      const payload = parsePayload(message);
      await this.executeCommand(relativeTopic, payload);
      if (!relativeTopic.startsWith('request/')) {
        await this.publish(`acks/${relativeTopic}`, { ok: true, topic: relativeTopic }, false);
        await wait(1_000);
        await this.publishAllStates();
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      logger.error(`MQTT command failed for ${relativeTopic}: ${messageText}`);
      await this.publish(`errors/${relativeTopic}`, {
        ok: false,
        topic: relativeTopic,
        error: messageText,
      }, false);
    }
  }

  private async executeCommand(relativeTopic: string, payload: unknown) {
    if (relativeTopic.startsWith('request/')) {
      await this.handleRequest(relativeTopic.replace(/^request\//, ''), payload);
      return;
    }

    switch (relativeTopic) {
    case 'deviceStatus/set':
      await this.setDeviceStatus(payload);
      return;
    case 'settings/set':
      await updateSettings(payload as DeepPartial<AppSettings>);
      return;
    case 'schedules/set':
      await updateSchedules(payload as Parameters<typeof updateSchedules>[0]);
      return;
    case 'services/set':
      await updateServices(payload as Parameters<typeof updateServices>[0]);
      return;
    case 'presence/set':
      await updatePresenceData(payload);
      return;
    case 'alarm/set':
      void executeAlarm(AlarmJobSchema.parse(payload));
      return;
    case 'execute/set':
      await this.executeFrankenCommand(payload);
      return;
    case 'ledBrightness/set':
      await this.setLedBrightness(payload);
      return;
    case 'prime/set':
      if (coerceBoolean(payload)) await updateDeviceStatus({ isPriming: true });
      return;
    case 'alarm/clear/set':
      if (coerceBoolean(payload)) await this.clearAlarm();
      return;
    default:
      await this.executeSideCommand(relativeTopic, payload);
    }
  }

  private async setDeviceStatus(payload: unknown) {
    const validationResult = DeviceStatusSchema.deepPartial().safeParse(payload);
    if (!validationResult.success) throw validationResult.error;
    await updateDeviceStatus(validationResult.data as DeepPartial<DeviceStatus>);
  }

  private async executeFrankenCommand(payload: unknown) {
    const commandPayload = toJsonObject(payload);
    const command = commandPayload.command;
    if (typeof command !== 'string' || !Object.keys(frankenCommands).includes(command)) {
      throw new Error(`Invalid Franken command: ${JSON.stringify(command)}`);
    }
    const arg = commandPayload.arg === undefined ? 'empty' : String(commandPayload.arg);
    await executeFunction(command as FrankenCommand, arg);
  }

  private async setLedBrightness(payload: unknown) {
    const ledBrightness = Math.round(coerceNumber(payload));
    if (ledBrightness < 0 || ledBrightness > 100) {
      throw new Error('LED brightness must be between 0 and 100');
    }
    await updateDeviceStatus({ settings: { ledBrightness } });
  }

  private async clearAlarm() {
    await updateDeviceStatus({
      left: { isAlarmVibrating: false },
      right: { isAlarmVibrating: false },
    });
  }

  private async setScheduleStageTemperature(side: Side, stage: ScheduleTemperatureStage, payload: unknown) {
    const temperatureF = Math.round(coerceNumber(payload));
    if (temperatureF < 55 || temperatureF > 110) {
      throw new Error('Schedule temperature must be between 55°F and 110°F');
    }

    await schedulesDB.read();
    await updateSchedules(buildScheduleTemperatureStageUpdate(schedulesDB.data, side, stage, temperatureF));
  }

  private async executeSideCommand(relativeTopic: string, payload: unknown) {
    const parts = relativeTopic.split('/');
    const [side, command, action] = parts;
    if (!SideSchema.safeParse(side).success) {
      throw new Error(`Unsupported MQTT topic: ${relativeTopic}`);
    }

    if (parts.length === 4 && command === 'schedule' && parts[3] === 'set') {
      const stage = SCHEDULE_TEMPERATURE_STAGE_COMMANDS[parts[2]];
      if (!stage) throw new Error(`Unsupported MQTT schedule command: ${relativeTopic}`);
      await this.setScheduleStageTemperature(side as Side, stage, payload);
      return;
    }

    if (parts.length !== 3 || action !== 'set') {
      throw new Error(`Unsupported MQTT topic: ${relativeTopic}`);
    }

    switch (command) {
    case 'temperature':
      await this.setSideStatus(side as Side, { targetTemperatureF: Math.round(coerceNumber(payload)) });
      return;
    case 'power':
      await this.setSideStatus(side as Side, { isOn: coerceBoolean(payload) });
      return;
    case 'secondsRemaining':
      await this.setSideStatus(side as Side, { secondsRemaining: Math.round(coerceNumber(payload)) });
      return;
    case 'alarmVibration':
      if (coerceBoolean(payload)) {
        throw new Error('Alarm vibration can only be cleared by setting it to false');
      }
      await this.setSideStatus(side as Side, { isAlarmVibrating: false });
      return;
    case 'awayMode':
      await updateSettings({ [side]: { awayMode: coerceBoolean(payload) } } as DeepPartial<AppSettings>);
      return;
    default:
      throw new Error(`Unsupported MQTT side command: ${relativeTopic}`);
    }
  }

  private async setSideStatus(side: Side, sideStatus: DeepPartial<DeviceStatus[Side]>) {
    const deviceStatus = { [side]: sideStatus } as DeepPartial<DeviceStatus>;
    await this.setDeviceStatus(deviceStatus);
  }

  private async handleRequest(resource: string, payload: unknown) {
    const envelope = parseRequestEnvelope(payload);
    const responseTopic = envelope.requestId ? `responses/${resource}/${envelope.requestId}` : `responses/${resource}`;
    const data = await this.loadRequestData(resource, envelope);
    await this.publish(responseTopic, {
      ok: true,
      requestId: envelope.requestId,
      resource,
      data,
    }, false);
  }

  private async loadRequestData(resource: string, envelope: RequestEnvelope): Promise<unknown> {
    switch (resource) {
    case 'all':
      await this.publishAllStates();
      return { published: true };
    case 'deviceStatus':
      return this.loadDeviceStatus();
    case 'settings':
      await settingsDB.read();
      return settingsDB.data;
    case 'schedules':
      await schedulesDB.read();
      return schedulesDB.data;
    case 'services':
      await servicesDB.read();
      return servicesDB.data;
    case 'serverStatus':
      return serverStatus.toJSON();
    case 'presence':
      return getPresenceData();
    case 'metrics/vitals':
    case 'vitals':
      return loadVitalsData(envelope.params || {});
    case 'metrics/vitals/summary':
    case 'vitals/summary':
      return loadVitalsSummaryData(envelope.params || {});
    case 'metrics/movement':
    case 'movement':
      return loadMovementData(envelope.params || {});
    case 'metrics/sleep':
    case 'sleep':
      return loadSleepData(envelope.params || {});
    default:
      throw new Error(`Unsupported MQTT request resource: ${resource}`);
    }
  }

  private async publishAllStates() {
    if (this.isPublishing) {
      this.publishAllStatesRequested = true;
      return;
    }

    this.isPublishing = true;
    try {
      do {
        this.publishAllStatesRequested = false;
        const deviceStatus = await this.runPublisher('device status', () => this.publishDeviceStatus());
        const settings = await this.runPublisher('settings', () => this.publishSettings());
        await this.runPublisher('schedules', () => this.publishSchedules());
        await this.runPublisher('services', () => this.publishServices());
        await this.runPublisher('server status', () => this.publishServerStatus());
        await this.runPublisher('presence', () => this.publishPresence());
        await this.runPublisher('latest metrics', () => this.publishLatestMetrics());
        if (this.settings?.homeAssistantDiscovery) {
          await this.runPublisher('Home Assistant discovery', () => this.publishHomeAssistantDiscovery(deviceStatus, settings));
        }
      } while (this.publishAllStatesRequested);
    } finally {
      this.isPublishing = false;
    }
  }

  private async runPublisher<T>(name: string, publisher: () => Promise<T>): Promise<T | undefined> {
    try {
      return await publisher();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`MQTT ${name} publish failed: ${message}`);
      return undefined;
    }
  }

  private async loadDeviceStatus() {
    const franken = await connectFranken();
    return franken.getDeviceStatus();
  }

  private async publishDeviceStatus(observedDeviceStatus?: DeviceStatus) {
    const deviceStatus = observedDeviceStatus || await this.loadDeviceStatus();
    await this.publish('deviceStatus/state', deviceStatus, true);
    await Promise.all(SideSchema.options.flatMap(side => [
      this.publish(`${side}/state`, deviceStatus[side], true),
      this.publish(`${side}/currentTemperatureF/state`, deviceStatus[side].currentTemperatureF, true),
      this.publish(`${side}/targetTemperatureF/state`, deviceStatus[side].targetTemperatureF, true),
      this.publish(`${side}/secondsRemaining/state`, deviceStatus[side].secondsRemaining, true),
      this.publish(`${side}/isOn/state`, deviceStatus[side].isOn, true),
      this.publish(`${side}/isAlarmVibrating/state`, deviceStatus[side].isAlarmVibrating, true),
    ]));
    await Promise.all([
      this.publish('waterLevel/state', deviceStatus.waterLevel, true),
      this.publish('isPriming/state', deviceStatus.isPriming, true),
      this.publish('wifiStrength/state', deviceStatus.wifiStrength, true),
      this.publish('ledBrightness/state', deviceStatus.settings.ledBrightness, true),
    ]);
    return deviceStatus;
  }

  private async publishSettings() {
    await settingsDB.read();
    await this.publish('settings/state', settingsDB.data, true);
    await Promise.all(SideSchema.options.map(side => this.publish(`${side}/awayMode/state`, settingsDB.data[side].awayMode, true)));
    return _.cloneDeep(settingsDB.data);
  }

  private async publishSchedules() {
    await schedulesDB.read();
    await settingsDB.read();
    const scheduleSummary = buildScheduleSummary(schedulesDB.data, settingsDB.data);
    const scheduleTemperatureStages = buildScheduleTemperatureStageStates(schedulesDB.data);
    await this.publish('schedules/state', schedulesDB.data, true);
    await this.publish('schedules/summary/state', scheduleSummary, true);
    await Promise.all(SideSchema.options.flatMap(side => [
      ...SCHEDULE_SUMMARY_KEYS.flatMap(summaryKey => {
        const event = scheduleSummary[side][summaryKey];
        return [
          this.publish(`${side}/schedule/${summaryKey}/state`, scheduleEventState(event), true),
          this.publish(`${side}/schedule/${summaryKey}/attributes`, scheduleEventAttributes(event), true),
        ];
      }),
      ...SCHEDULE_TEMPERATURE_STAGE_KEYS.map(stage => this.publish(
        `${side}/schedule/${stage}TemperatureF/state`,
        scheduleTemperatureStages[side][stage],
        true,
      )),
    ]));
  }

  private async publishServices() {
    await servicesDB.read();
    await this.publish('services/state', servicesDB.data, true);
  }

  private async publishServerStatus() {
    await this.publish('serverStatus/state', await serverStatus.toJSON(), true);
  }

  private async publishPresence() {
    const presence = getPresenceData();
    await this.publish('presence/state', presence, true);
    await Promise.all(SideSchema.options.map(side => this.publish(`${side}/presence/state`, presence[side].present, true)));
  }

  private async publishLatestMetrics() {
    const [vitals, movement, sleep] = await Promise.all([
      loadLatestVitalsBySide(),
      loadLatestMovementBySide(),
      loadLatestSleepBySide(),
    ]);

    await Promise.all([
      this.publish('metrics/vitals/latest/state', vitals, true),
      this.publish('metrics/movement/latest/state', movement, true),
      this.publish('metrics/sleep/latest/state', sleep, true),
      ...SideSchema.options.flatMap(side => [
        this.publish(`${side}/heartRate/state`, vitals[side]?.heart_rate ?? null, true),
        this.publish(`${side}/hrv/state`, vitals[side]?.hrv ?? null, true),
        this.publish(`${side}/breathingRate/state`, vitals[side]?.breathing_rate ?? null, true),
        this.publish(`${side}/movement/state`, movement[side]?.total_movement ?? null, true),
        this.publish(`${side}/lastSleep/state`, sleep[side] ?? null, true),
      ]),
    ]);
  }

  private async publishHomeAssistantDiscovery(deviceStatus?: DeviceStatus, settings?: AppSettings) {
    const mqttSettings = this.settings;
    if (!mqttSettings) return;

    const messages = buildHomeAssistantDiscoveryMessages({
      deviceId: mqttSettings.deviceId,
      topicPrefix: mqttSettings.topicPrefix,
      discoveryPrefix: mqttSettings.discoveryPrefix,
      deviceStatus,
      settings,
    });

    await Promise.all(messages.map(message => this.publishRaw(message.topic, message.payload, true)));
  }

  private async publish(topicPath: string, payload: unknown, retain: boolean) {
    await this.publishRaw(this.fullTopic(topicPath), payload, retain);
  }

  private async publishRaw(topicPath: string, payload: unknown, retain: boolean) {
    const client = this.client;
    if (!client?.connected) return;
    const serializedPayload = this.serializePayload(payload);
    await new Promise<void>((resolve, reject) => {
      client.publish(topicPath, serializedPayload, { qos: 0, retain }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private serializePayload(payload: unknown) {
    if (payload === null || payload === undefined) return '';
    if (typeof payload === 'string') return payload;
    if (typeof payload === 'number' || typeof payload === 'boolean') return String(payload);
    return JSON.stringify(payload);
  }

  private fullTopic(topicPath: string) {
    const prefix = this.settings?.topicPrefix;
    if (!prefix) throw new Error('MQTT topic prefix is not configured');
    return `${prefix}/${normalizeTopic(topicPath)}`;
  }

  private toRelativeTopic(topicPath: string) {
    const topicPrefix = this.settings?.topicPrefix;
    if (!topicPrefix) return undefined;
    const prefix = `${topicPrefix}/`;
    if (!topicPath.startsWith(prefix)) return undefined;
    return topicPath.slice(prefix.length);
  }
}

let mqttService: MqttService | undefined;

export function startMqttService(): MqttService {
  mqttService = new MqttService();
  void mqttService.start();
  return mqttService;
}

export async function reloadMqttServiceSettings() {
  await mqttService?.reloadSettings();
}

export async function publishObservedMqttDeviceStatus(deviceStatus: DeviceStatus) {
  await mqttService?.publishObservedDeviceStatus(deviceStatus);
}
