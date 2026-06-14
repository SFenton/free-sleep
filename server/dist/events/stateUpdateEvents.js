import { EventEmitter } from 'events';
const stateUpdateEvents = new EventEmitter();
const onStateUpdate = (event, listener) => {
    stateUpdateEvents.on(event, listener);
    return () => stateUpdateEvents.off(event, listener);
};
export const notifyMetricsUpdated = () => stateUpdateEvents.emit('metricsUpdated');
export const notifyPresenceUpdated = () => stateUpdateEvents.emit('presenceUpdated');
export const notifyWifiStrengthUpdated = (signal) => stateUpdateEvents.emit('wifiStrengthUpdated', signal);
export const onMetricsUpdated = (listener) => onStateUpdate('metricsUpdated', listener);
export const onPresenceUpdated = (listener) => onStateUpdate('presenceUpdated', listener);
export const onWifiStrengthUpdated = (listener) => {
    stateUpdateEvents.on('wifiStrengthUpdated', listener);
    return () => stateUpdateEvents.off('wifiStrengthUpdated', listener);
};
//# sourceMappingURL=stateUpdateEvents.js.map