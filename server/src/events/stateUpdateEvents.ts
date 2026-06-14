import { EventEmitter } from 'events';

type StateUpdateEvent = 'metricsUpdated' | 'presenceUpdated' | 'wifiStrengthUpdated';

const stateUpdateEvents = new EventEmitter();

const onStateUpdate = (event: StateUpdateEvent, listener: () => void) => {
  stateUpdateEvents.on(event, listener);
  return () => stateUpdateEvents.off(event, listener);
};

export const notifyMetricsUpdated = () => stateUpdateEvents.emit('metricsUpdated');
export const notifyPresenceUpdated = () => stateUpdateEvents.emit('presenceUpdated');
export const notifyWifiStrengthUpdated = (signal: number) => stateUpdateEvents.emit('wifiStrengthUpdated', signal);

export const onMetricsUpdated = (listener: () => void) => onStateUpdate('metricsUpdated', listener);
export const onPresenceUpdated = (listener: () => void) => onStateUpdate('presenceUpdated', listener);
export const onWifiStrengthUpdated = (listener: (signal: number) => void) => {
  stateUpdateEvents.on('wifiStrengthUpdated', listener);
  return () => stateUpdateEvents.off('wifiStrengthUpdated', listener);
};
