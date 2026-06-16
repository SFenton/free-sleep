import { DeviceStatus } from '../routes/deviceStatus/deviceStatusSchema.js';
import { Settings } from '../db/settingsSchema.js';
import { Side, SideSchema } from '../db/schedulesSchema.js';
import { SCHEDULE_BEDTIME_COMMAND, SCHEDULE_BEDTIME_LABEL } from './scheduleBedtimes.js';
import { SCHEDULE_SUMMARY_KEYS, SCHEDULE_SUMMARY_LABELS } from './scheduleSummary.js';
import { SCHEDULE_TEMPERATURE_STAGE_KEYS, SCHEDULE_TEMPERATURE_STAGE_LABELS } from './scheduleStageTemperatures.js';

export interface DiscoveryMessage {
  topic: string;
  payload: Record<string, unknown>;
}

interface DiscoveryOptions {
  deviceId: string;
  topicPrefix: string;
  discoveryPrefix: string;
  deviceStatus?: DeviceStatus;
  settings?: Settings;
}

const sanitize = (value: string) => value.replace(/[^A-Za-z0-9_]+/g, '').replace(/^_+|_+$/g, '');

const topic = (topicPrefix: string, path: string) => `${topicPrefix}/${path}`;

const sideName = (settings: Settings | undefined, side: Side) => settings?.[side]?.name || side;

const FREE_SLEEP_MIN_TEMPERATURE_F = 55;
const FREE_SLEEP_MAX_TEMPERATURE_F = 110;
const FREE_SLEEP_LEVEL_MIN = -10;
const FREE_SLEEP_LEVEL_MAX = 10;
const FREE_SLEEP_TEMPERATURE_RANGE_F = FREE_SLEEP_MAX_TEMPERATURE_F - FREE_SLEEP_MIN_TEMPERATURE_F;
const FREE_SLEEP_LEVEL_RANGE = FREE_SLEEP_LEVEL_MAX - FREE_SLEEP_LEVEL_MIN;

const TEMPERATURE_F_TO_LEVEL_EXPRESSION = [
  `(f - ${FREE_SLEEP_MIN_TEMPERATURE_F})`,
  `/ ${FREE_SLEEP_TEMPERATURE_RANGE_F}`,
  `* ${FREE_SLEEP_LEVEL_RANGE}`,
  `+ ${FREE_SLEEP_LEVEL_MIN}`,
].join(' ');

const LEVEL_TO_TEMPERATURE_F_EXPRESSION = [
  `(clamped - ${FREE_SLEEP_LEVEL_MIN})`,
  `/ ${FREE_SLEEP_LEVEL_RANGE}`,
  `* ${FREE_SLEEP_TEMPERATURE_RANGE_F}`,
  `+ ${FREE_SLEEP_MIN_TEMPERATURE_F}`,
].join(' ');

const TEMPERATURE_F_TO_LEVEL_TEMPLATE = [
  '{% set f = value | float(none) %}',
  '{% if f is not none %}',
  `{{ (${TEMPERATURE_F_TO_LEVEL_EXPRESSION}) | round(0) | int }}`,
  '{% endif %}',
].join('');

const LEVEL_TO_TEMPERATURE_F_TEMPLATE = [
  '{% set level = value | float(0) %}',
  `{% set clamped = ${FREE_SLEEP_LEVEL_MAX} if level > ${FREE_SLEEP_LEVEL_MAX} `,
  `else ${FREE_SLEEP_LEVEL_MIN} if level < ${FREE_SLEEP_LEVEL_MIN} else level %}`,
  `{{ (${LEVEL_TO_TEMPERATURE_F_EXPRESSION}) | round(0) | int }}`,
].join('');

const temperatureLevelNumberPayload = (name: string, stateTopic: string, commandTopic: string) => ({
  name,
  state_topic: stateTopic,
  command_topic: commandTopic,
  value_template: TEMPERATURE_F_TO_LEVEL_TEMPLATE,
  command_template: LEVEL_TO_TEMPERATURE_F_TEMPLATE,
  min: FREE_SLEEP_LEVEL_MIN,
  max: FREE_SLEEP_LEVEL_MAX,
  step: 1,
  mode: 'slider',
  unit_of_measurement: '°',
  icon: 'mdi:thermometer-lines',
});

export function buildHomeAssistantDiscoveryMessages({
  deviceId,
  topicPrefix,
  discoveryPrefix,
  deviceStatus,
  settings,
}: DiscoveryOptions): DiscoveryMessage[] {
  const safeDeviceId = sanitize(deviceId);
  const availability = topic(topicPrefix, 'status');
  const device = {
    identifiers: [safeDeviceId],
    name: safeDeviceId,
    manufacturer: 'Free Sleep',
    model: deviceStatus?.hubVersion || 'Eight Sleep Pod',
    sw_version: deviceStatus?.freeSleep.version,
  };
  const origin = {
    name: 'Free Sleep',
    sw_version: deviceStatus?.freeSleep.version,
  };

  const messages: DiscoveryMessage[] = [];

  const add = (component: string, objectId: string, payload: Record<string, unknown>) => {
    messages.push({
      topic: `${discoveryPrefix}/${component}/${objectId}/config`,
      payload: {
        ...payload,
        unique_id: objectId,
        object_id: objectId,
        availability_topic: availability,
        payload_available: 'online',
        payload_not_available: 'offline',
        device,
        origin,
      },
    });
  };

  add('sensor', `${safeDeviceId}_wifi_strength`, {
    name: 'WiFi Strength',
    state_topic: topic(topicPrefix, 'wifiStrength/state'),
    unit_of_measurement: '%',
    icon: 'mdi:wifi',
  });
  add('sensor', `${safeDeviceId}_water_level`, {
    name: 'Water Level',
    state_topic: topic(topicPrefix, 'waterLevel/state'),
    icon: 'mdi:water',
  });
  add('binary_sensor', `${safeDeviceId}_priming`, {
    name: 'Priming',
    state_topic: topic(topicPrefix, 'isPriming/state'),
    payload_on: 'true',
    payload_off: 'false',
    icon: 'mdi:water-pump',
  });
  add('number', `${safeDeviceId}_led_brightness`, {
    name: 'LED Brightness',
    state_topic: topic(topicPrefix, 'ledBrightness/state'),
    command_topic: topic(topicPrefix, 'ledBrightness/set'),
    min: 0,
    max: 100,
    step: 1,
    mode: 'slider',
    unit_of_measurement: '%',
    icon: 'mdi:led-on',
  });
  add('button', `${safeDeviceId}_prime`, {
    name: 'Prime Pod',
    command_topic: topic(topicPrefix, 'prime/set'),
    payload_press: 'true',
    icon: 'mdi:water-sync',
  });
  add('button', `${safeDeviceId}_clear_alarm`, {
    name: 'Clear Alarm',
    command_topic: topic(topicPrefix, 'alarm/clear/set'),
    payload_press: 'true',
    icon: 'mdi:alarm-off',
  });
  add('sensor', `${safeDeviceId}_schedules`, {
    name: 'Schedules',
    state_topic: topic(topicPrefix, 'schedules/state'),
    value_template: '{{ "ok" }}',
    json_attributes_topic: topic(topicPrefix, 'schedules/state'),
    icon: 'mdi:calendar-clock',
  });

  for (const side of SideSchema.options) {
    const name = sideName(settings, side);
    const sideId = `${safeDeviceId}_${side}`;

    add('switch', `${sideId}_power`, {
      name: `${name} Power`,
      state_topic: topic(topicPrefix, `${side}/isOn/state`),
      command_topic: topic(topicPrefix, `${side}/power/set`),
      payload_on: 'true',
      payload_off: 'false',
      icon: 'mdi:power',
    });
    add('number', `${sideId}_target_temperature`, {
      ...temperatureLevelNumberPayload(
        `${name} Target Level`,
        topic(topicPrefix, `${side}/targetTemperatureF/state`),
        topic(topicPrefix, `${side}/temperature/set`),
      ),
    });
    for (const stage of SCHEDULE_TEMPERATURE_STAGE_KEYS) {
      add('number', `${sideId}_${stage}_temperature`, {
        ...temperatureLevelNumberPayload(
          `${name} ${SCHEDULE_TEMPERATURE_STAGE_LABELS[stage]}`,
          topic(topicPrefix, `${side}/schedule/${stage}TemperatureF/state`),
          topic(topicPrefix, `${side}/schedule/${stage}TemperatureF/set`),
        ),
      });
    }
    add('text', `${sideId}_${SCHEDULE_BEDTIME_COMMAND}`, {
      name: `${name} ${SCHEDULE_BEDTIME_LABEL}`,
      state_topic: topic(topicPrefix, `${side}/schedule/${SCHEDULE_BEDTIME_COMMAND}/state`),
      command_topic: topic(topicPrefix, `${side}/schedule/${SCHEDULE_BEDTIME_COMMAND}/set`),
      pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
      mode: 'text',
      icon: 'mdi:bed-clock',
    });
    add('sensor', `${sideId}_current_temperature`, {
      name: `${name} Current Temperature`,
      state_topic: topic(topicPrefix, `${side}/currentTemperatureF/state`),
      device_class: 'temperature',
      unit_of_measurement: '°F',
    });
    add('sensor', `${sideId}_seconds_remaining`, {
      name: `${name} Seconds Remaining`,
      state_topic: topic(topicPrefix, `${side}/secondsRemaining/state`),
      unit_of_measurement: 's',
      icon: 'mdi:timer-outline',
    });
    add('binary_sensor', `${sideId}_alarm_vibrating`, {
      name: `${name} Alarm Vibrating`,
      state_topic: topic(topicPrefix, `${side}/isAlarmVibrating/state`),
      payload_on: 'true',
      payload_off: 'false',
      icon: 'mdi:vibrate',
    });
    add('binary_sensor', `${sideId}_presence`, {
      name: `${name} Presence`,
      state_topic: topic(topicPrefix, `${side}/presence/state`),
      payload_on: 'true',
      payload_off: 'false',
      device_class: 'occupancy',
    });
    add('switch', `${sideId}_away_mode`, {
      name: `${name} Away Mode`,
      state_topic: topic(topicPrefix, `${side}/awayMode/state`),
      command_topic: topic(topicPrefix, `${side}/awayMode/set`),
      payload_on: 'true',
      payload_off: 'false',
      icon: 'mdi:bed-empty',
    });
    add('switch', `${sideId}_alarms_enabled`, {
      name: `${name} Alarms Enabled`,
      state_topic: topic(topicPrefix, `${side}/alarmsEnabled/state`),
      command_topic: topic(topicPrefix, `${side}/alarmsEnabled/set`),
      payload_on: 'true',
      payload_off: 'false',
      icon: 'mdi:alarm-check',
    });
    add('sensor', `${sideId}_heart_rate`, {
      name: `${name} Heart Rate`,
      state_topic: topic(topicPrefix, `${side}/heartRate/state`),
      unit_of_measurement: 'bpm',
      icon: 'mdi:heart-pulse',
    });
    add('sensor', `${sideId}_hrv`, {
      name: `${name} HRV`,
      state_topic: topic(topicPrefix, `${side}/hrv/state`),
      unit_of_measurement: 'ms',
      icon: 'mdi:heart-cog',
    });
    add('sensor', `${sideId}_breathing_rate`, {
      name: `${name} Breathing Rate`,
      state_topic: topic(topicPrefix, `${side}/breathingRate/state`),
      unit_of_measurement: 'brpm',
      icon: 'mdi:lungs',
    });
    add('sensor', `${sideId}_movement`, {
      name: `${name} Movement`,
      state_topic: topic(topicPrefix, `${side}/movement/state`),
      icon: 'mdi:motion-sensor',
    });

    for (const summaryKey of SCHEDULE_SUMMARY_KEYS) {
      add('sensor', `${sideId}_${summaryKey}`, {
        name: `${name} ${SCHEDULE_SUMMARY_LABELS[summaryKey]}`,
        state_topic: topic(topicPrefix, `${side}/schedule/${summaryKey}/state`),
        json_attributes_topic: topic(topicPrefix, `${side}/schedule/${summaryKey}/attributes`),
        device_class: 'timestamp',
        icon: 'mdi:calendar-clock',
      });
    }
  }

  return messages;
}
