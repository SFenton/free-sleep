import { EventEmitter } from 'events';
const stateUpdateEvents = new EventEmitter();
const onStateUpdate = (event, listener) => {
    stateUpdateEvents.on(event, listener);
    return () => stateUpdateEvents.off(event, listener);
};
export const notifyMetricsUpdated = () => stateUpdateEvents.emit('metricsUpdated');
export const notifyPresenceUpdated = () => stateUpdateEvents.emit('presenceUpdated');
export const onMetricsUpdated = (listener) => onStateUpdate('metricsUpdated', listener);
export const onPresenceUpdated = (listener) => onStateUpdate('presenceUpdated', listener);
//# sourceMappingURL=stateUpdateEvents.js.map