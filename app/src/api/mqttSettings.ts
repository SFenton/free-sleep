import axios from './api';
import { useQuery } from '@tanstack/react-query';
import { DeepPartial } from 'ts-essentials';

import { MqttSettings } from './mqttSettingsSchema.ts';

export * from './mqttSettingsSchema.ts';

export const useMqttSettings = () => useQuery<MqttSettings>({
  queryKey: ['useMqttSettings'],
  queryFn: async () => {
    const response = await axios.get<MqttSettings>('/mqttSettings');
    return response.data;
  },
});

export const postMqttSettings = (mqttSettings: DeepPartial<MqttSettings>) => {
  return axios.post('/mqttSettings', mqttSettings);
};
