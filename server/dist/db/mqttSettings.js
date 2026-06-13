// LowDB, stores MQTT settings in /persistent/free-sleep-data/lowdb/mqttSettingsDB.json
import _ from 'lodash';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import config, { normalizeMqttDeviceId, normalizeMqttTopicPrefix } from '../config.js';
import { MqttSettingsSchema } from './mqttSettingsSchema.js';
const defaultData = {
    enabled: config.mqtt.enabled,
    url: config.mqtt.url,
    username: config.mqtt.username || '',
    password: config.mqtt.password || '',
    deviceId: config.mqtt.deviceId,
    topicPrefix: config.mqtt.topicPrefix,
    homeAssistantDiscovery: config.mqtt.discovery,
    discoveryPrefix: config.mqtt.discoveryPrefix,
    pollIntervalMs: config.mqtt.pollIntervalMs,
};
const file = new JSONFile(`${config.lowDbFolder}mqttSettingsDB.json`);
const mqttSettingsDB = new Low(file, defaultData);
await mqttSettingsDB.read();
// Allows us to add default values to MQTT settings if users have existing mqttSettingsDB.json data
mqttSettingsDB.data = _.merge({}, defaultData, mqttSettingsDB.data);
const parsedData = MqttSettingsSchema.parse(mqttSettingsDB.data);
mqttSettingsDB.data = {
    ...parsedData,
    deviceId: normalizeMqttDeviceId(parsedData.deviceId) || parsedData.deviceId,
    topicPrefix: normalizeMqttTopicPrefix(parsedData.topicPrefix),
    discoveryPrefix: normalizeMqttTopicPrefix(parsedData.discoveryPrefix),
};
await mqttSettingsDB.write();
export default mqttSettingsDB;
//# sourceMappingURL=mqttSettings.js.map