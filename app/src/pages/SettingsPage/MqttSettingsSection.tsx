import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

import { MqttSettings, postMqttSettings, useMqttSettings } from '@api/mqttSettings.ts';
import { useAppStore } from '@state/appStore.tsx';
import Section from './Section.tsx';

const normalizeTopicPrefix = (value: string) => value.replace(/^\/+|\/+$/g, '');
const hasDeviceIdWords = (value: string) => Boolean(value.trim().match(/[A-Za-z0-9]+/g)?.length);

const validateMqttSettings = (settings: MqttSettings) => {
  if (!settings.enabled) return '';
  if (!settings.url.trim()) return 'Broker URL is required when MQTT is enabled.';
  if (!settings.deviceId.trim()) return 'Device ID is required when MQTT is enabled.';
  if (!hasDeviceIdWords(settings.deviceId)) return 'Device ID must contain letters or numbers.';
  if (!normalizeTopicPrefix(settings.topicPrefix)) return 'Topic prefix is required when MQTT is enabled.';
  if (settings.homeAssistantDiscovery && !normalizeTopicPrefix(settings.discoveryPrefix)) {
    return 'Discovery prefix is required when Home Assistant discovery is enabled.';
  }
  if (!Number.isFinite(settings.pollIntervalMs) || settings.pollIntervalMs < 5_000) {
    return 'Poll interval must be at least 5000 milliseconds.';
  }
  return '';
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null || !('response' in error)) return fallback;
  const response = (error as { response?: { data?: { error?: unknown } } }).response;
  return typeof response?.data?.error === 'string' ? response.data.error : fallback;
};

export default function MqttSettingsSection() {
  const { data: mqttSettings, refetch, isLoading } = useMqttSettings();
  const isUpdating = useAppStore(state => state.isUpdating);
  const setIsUpdating = useAppStore(state => state.setIsUpdating);
  const [draftSettings, setDraftSettings] = useState<MqttSettings>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (mqttSettings) setDraftSettings(mqttSettings);
  }, [mqttSettings]);

  const saveMqttSettings = (settings: MqttSettings) => {
    const validationError = validateMqttSettings(settings);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setIsUpdating(true);
    postMqttSettings(settings)
      .then(() => refetch())
      .catch(error => {
        console.error(error);
        setError(getErrorMessage(error, 'Unable to save MQTT settings.'));
      })
      .finally(() => setIsUpdating(false));
  };

  if (isLoading || !draftSettings) return <CircularProgress />;

  const setDraftValue = <Key extends keyof MqttSettings>(key: Key, value: MqttSettings[Key]) => {
    setDraftSettings({ ...draftSettings, [key]: value });
  };

  const toggleEnabled = (enabled: boolean) => {
    const nextSettings = { ...draftSettings, enabled };
    setDraftSettings(nextSettings);
    if (enabled) {
      saveMqttSettings(nextSettings);
      return;
    }

    setError('');
    setIsUpdating(true);
    postMqttSettings({ enabled: false })
      .then(() => refetch())
      .catch(error => {
        console.error(error);
        setError(getErrorMessage(error, 'Unable to disable MQTT.'));
      })
      .finally(() => setIsUpdating(false));
  };

  return (
    <Section title="MQTT">
      <Box sx={ { display: 'flex', flexDirection: 'column', gap: 2 } }>
        <FormControlLabel
          control={
            <Switch
              disabled={ isUpdating }
              checked={ draftSettings.enabled }
              onChange={ (event) => toggleEnabled(event.target.checked) }
            />
          }
          label="Enable MQTT"
        />
        <Typography color="text.secondary">
          Publishes bed state and accepts control commands over MQTT for Home Assistant and other automation tools.
          Disabling MQTT disconnects the broker client immediately.
        </Typography>

        {
          draftSettings.enabled && (
            <>
              <TextField
                label="Broker URL"
                value={ draftSettings.url }
                onChange={ event => setDraftValue('url', event.target.value) }
                disabled={ isUpdating }
                required
                fullWidth
                placeholder="mqtt://homeassistant.local:1883"
                helperText="MQTT broker connection URL. Use mqtt:// for plain MQTT or mqtts:// for TLS."
              />
              <TextField
                label="Username"
                value={ draftSettings.username }
                onChange={ event => setDraftValue('username', event.target.value) }
                disabled={ isUpdating }
                fullWidth
                helperText="Optional broker username."
              />
              <TextField
                label="Password"
                type="password"
                value={ draftSettings.password }
                onChange={ event => setDraftValue('password', event.target.value) }
                disabled={ isUpdating }
                fullWidth
                autoComplete="new-password"
                helperText="Optional broker password. Leave blank if your broker does not require one."
              />
              <TextField
                label="Device ID"
                value={ draftSettings.deviceId }
                onChange={ event => setDraftValue('deviceId', event.target.value) }
                disabled={ isUpdating }
                required
                fullWidth
                placeholder="LullabyPillowBed"
                helperText="Unique per-Pod identifier and Home Assistant friendly name. Use three words with no spaces, like LullabyPillowBed."
              />
              <TextField
                label="Topic prefix"
                value={ draftSettings.topicPrefix }
                onChange={ event => setDraftValue('topicPrefix', event.target.value) }
                disabled={ isUpdating }
                required
                fullWidth
                placeholder={ `free-sleep/${draftSettings.deviceId || 'LullabyPillowBed'}` }
                helperText="Base namespace for this Pod. Include the Device ID to avoid collisions on shared brokers."
              />
              <FormControlLabel
                control={
                  <Switch
                    disabled={ isUpdating }
                    checked={ draftSettings.homeAssistantDiscovery }
                    onChange={ event => setDraftValue('homeAssistantDiscovery', event.target.checked) }
                  />
                }
                label="Home Assistant discovery"
              />
              {
                draftSettings.homeAssistantDiscovery && (
                  <TextField
                    label="Discovery prefix"
                    value={ draftSettings.discoveryPrefix }
                    onChange={ event => setDraftValue('discoveryPrefix', event.target.value) }
                    disabled={ isUpdating }
                    required
                    fullWidth
                    placeholder="homeassistant"
                    helperText="Home Assistant discovery topic prefix. The default for most installations is homeassistant."
                  />
                )
              }
              <TextField
                label="Poll interval (ms)"
                type="number"
                value={ draftSettings.pollIntervalMs }
                onChange={ event => setDraftValue('pollIntervalMs', Number(event.target.value)) }
                disabled={ isUpdating }
                required
                fullWidth
                inputProps={ { min: 5000, step: 1000 } }
                helperText="How often retained MQTT state is refreshed. Minimum is 5000 ms."
              />
              {
                error && (
                  <Typography color="error">
                    { error }
                  </Typography>
                )
              }
              <Button
                disabled={ isUpdating }
                variant="contained"
                onClick={ () => saveMqttSettings(draftSettings) }
              >
                Save MQTT settings
              </Button>
            </>
          )
        }
        {
          !draftSettings.enabled && error && (
            <Typography color="error">
              { error }
            </Typography>
          )
        }
      </Box>
    </Section>
  );
}
