import { randomUUID } from 'crypto';
import path from 'path';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import config from '../config.js';
export const INPUT_SIGNAL_FIELDS = ['dismissAlarm', 'doubleTap', 'tripleTap', 'quadTap'];
const INPUT_SIGNAL_EVENT_LIMIT = 500;
export const INPUT_SIGNAL_MONITOR_FILE = path.join(config.dbFolder, 'input-signals.json');
const defaultInputSignalMonitorData = () => ({
    version: 1,
    updatedAt: new Date(0).toISOString(),
    lastSnapshot: {},
    events: [],
});
function parseRawDeviceStatusFields(response) {
    const fields = {};
    response.split(/\r?\n/).forEach(line => {
        const separatorIndex = line.indexOf(' = ');
        if (separatorIndex < 0)
            return;
        fields[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 3);
    });
    return fields;
}
function parseInputSignalValue(value) {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Input signal value is not an object: ${value}`);
    }
    return Object.fromEntries(Object.entries(parsed)
        .filter((entry) => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
}
function extractInputSignalSnapshot(rawDeviceStatusResponse) {
    const fields = parseRawDeviceStatusFields(rawDeviceStatusResponse);
    const snapshot = {};
    for (const field of INPUT_SIGNAL_FIELDS) {
        const value = fields[field];
        if (!value)
            continue;
        snapshot[field] = parseInputSignalValue(value);
    }
    return {
        rawDeviceStatusKeys: Object.keys(fields).sort(),
        snapshot,
    };
}
function inputSignalChannelToSide(channel) {
    if (channel === 'l')
        return 'left';
    if (channel === 'r')
        return 'right';
    if (channel === 's')
        return 'shared';
    return 'unknown';
}
function createInputSignalEvents(previousSnapshot, snapshot, source, observedAt, rawDeviceStatusKeys) {
    const events = [];
    for (const field of INPUT_SIGNAL_FIELDS) {
        const currentValue = snapshot[field];
        if (!currentValue)
            continue;
        const previousValue = previousSnapshot[field];
        if (!previousValue)
            continue;
        for (const [channel, value] of Object.entries(currentValue)) {
            if (previousValue[channel] === value)
                continue;
            events.push({
                id: randomUUID(),
                observedAt,
                source,
                field,
                channel,
                side: inputSignalChannelToSide(channel),
                value,
                previousValue: previousValue[channel],
                rawValue: currentValue,
                rawDeviceStatusKeys,
            });
        }
    }
    return events;
}
function inputSignalSnapshotsEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}
async function writeInputSignalMonitorData(data) {
    await mkdir(path.dirname(INPUT_SIGNAL_MONITOR_FILE), { recursive: true });
    const temporaryPath = `${INPUT_SIGNAL_MONITOR_FILE}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(data, null, 2));
    await rename(temporaryPath, INPUT_SIGNAL_MONITOR_FILE);
}
export async function loadInputSignalMonitorData() {
    try {
        const contents = await readFile(INPUT_SIGNAL_MONITOR_FILE, 'utf8');
        const parsed = JSON.parse(contents);
        return {
            ...defaultInputSignalMonitorData(),
            ...parsed,
            lastSnapshot: parsed.lastSnapshot ?? {},
            events: Array.isArray(parsed.events) ? parsed.events : [],
        };
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return defaultInputSignalMonitorData();
        }
        throw error;
    }
}
export function selectInputSignalEvents(events, filter) {
    return events
        .filter(event => {
        const timestamp = Date.parse(event.observedAt) / 1_000;
        if (filter.since !== undefined && timestamp < filter.since)
            return false;
        return !(filter.until !== undefined && timestamp > filter.until);
    })
        .slice(-filter.limit);
}
export async function recordInputSignalSnapshot(rawDeviceStatusResponse, source) {
    const { rawDeviceStatusKeys, snapshot } = extractInputSignalSnapshot(rawDeviceStatusResponse);
    const monitorData = await loadInputSignalMonitorData();
    const observedAt = new Date().toISOString();
    if (Object.keys(monitorData.lastSnapshot).length === 0) {
        const initializedData = {
            ...monitorData,
            updatedAt: observedAt,
            lastSnapshot: snapshot,
        };
        await writeInputSignalMonitorData(initializedData);
        return [];
    }
    const events = createInputSignalEvents(monitorData.lastSnapshot, snapshot, source, observedAt, rawDeviceStatusKeys);
    if (events.length === 0) {
        if (!inputSignalSnapshotsEqual(monitorData.lastSnapshot, snapshot)) {
            await writeInputSignalMonitorData({
                ...monitorData,
                updatedAt: observedAt,
                lastSnapshot: snapshot,
            });
        }
        return [];
    }
    const updatedData = {
        ...monitorData,
        updatedAt: observedAt,
        lastSnapshot: snapshot,
        events: [...monitorData.events, ...events].slice(-INPUT_SIGNAL_EVENT_LIMIT),
    };
    await writeInputSignalMonitorData(updatedData);
    return events;
}
//# sourceMappingURL=inputSignalMonitor.js.map