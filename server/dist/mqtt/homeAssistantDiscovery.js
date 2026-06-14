import { SideSchema } from '../db/schedulesSchema.js';
import { SCHEDULE_SUMMARY_KEYS, SCHEDULE_SUMMARY_LABELS } from './scheduleSummary.js';
const sanitize = (value) => value.replace(/[^A-Za-z0-9_]+/g, '').replace(/^_+|_+$/g, '');
const topic = (topicPrefix, path) => `${topicPrefix}/${path}`;
const sideName = (settings, side) => settings?.[side]?.name || side;
export function buildHomeAssistantDiscoveryMessages({ deviceId, topicPrefix, discoveryPrefix, deviceStatus, settings, }) {
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
    const messages = [];
    const add = (component, objectId, payload) => {
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
            name: `${name} Target Temperature`,
            state_topic: topic(topicPrefix, `${side}/targetTemperatureF/state`),
            command_topic: topic(topicPrefix, `${side}/temperature/set`),
            min: 55,
            max: 110,
            step: 1,
            mode: 'slider',
            device_class: 'temperature',
            unit_of_measurement: '°F',
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
//# sourceMappingURL=homeAssistantDiscovery.js.map