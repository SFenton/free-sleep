// WARNING! - Any changes here MUST be the same between app/src/api & server/src/db/
import { z } from 'zod';
const OptionalStringSchema = z.string().optional().default('');
const normalizeTopicPrefix = (value) => value.replace(/^\/+|\/+$/g, '');
const hasDeviceIdWords = (value) => Boolean(value.trim().match(/[A-Za-z0-9]+/g)?.length);
export const MqttSettingsFieldsSchema = z.object({
    enabled: z.boolean(),
    url: z.string(),
    username: OptionalStringSchema,
    password: OptionalStringSchema,
    deviceId: z.string(),
    topicPrefix: z.string(),
    homeAssistantDiscovery: z.boolean(),
    discoveryPrefix: z.string(),
    pollIntervalMs: z.number().int().min(5_000).max(3_600_000),
}).strict();
export const MqttSettingsUpdateSchema = MqttSettingsFieldsSchema.partial();
export const MqttSettingsSchema = MqttSettingsFieldsSchema.superRefine((settings, context) => {
    if (!settings.enabled)
        return;
    if (!settings.url.trim()) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['url'],
            message: 'MQTT broker URL is required when MQTT is enabled',
        });
    }
    if (!settings.deviceId.trim()) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['deviceId'],
            message: 'Device ID is required when MQTT is enabled',
        });
    }
    else if (!hasDeviceIdWords(settings.deviceId)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['deviceId'],
            message: 'Device ID must contain letters or numbers',
        });
    }
    if (!normalizeTopicPrefix(settings.topicPrefix)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['topicPrefix'],
            message: 'Topic prefix is required when MQTT is enabled',
        });
    }
    if (settings.homeAssistantDiscovery && !normalizeTopicPrefix(settings.discoveryPrefix)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['discoveryPrefix'],
            message: 'Discovery prefix is required when Home Assistant discovery is enabled',
        });
    }
});
//# sourceMappingURL=mqttSettingsSchema.js.map