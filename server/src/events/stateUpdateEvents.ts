import { EventEmitter } from 'events';

type StateUpdateEvent = 'metricsUpdated' | 'presenceUpdated';

const stateUpdateEvents = new EventEmitter();

const onStateUpdate = (event: StateUpdateEvent, listener: () => void) => {
  stateUpdateEvents.on(event, listener);
  return () => stateUpdateEvents.off(event, listener);
};

export const notifyMetricsUpdated = () => stateUpdateEvents.emit('metricsUpdated');
export const notifyPresenceUpdated = () => stateUpdateEvents.emit('presenceUpdated');

export const onMetricsUpdated = (listener: () => void) => onStateUpdate('metricsUpdated', listener);
export const onPresenceUpdated = (listener: () => void) => onStateUpdate('presenceUpdated', listener);
