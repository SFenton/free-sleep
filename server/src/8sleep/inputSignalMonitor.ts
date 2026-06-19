import { randomUUID } from 'crypto';
import path from 'path';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import config from '../config.js';

const INPUT_SIGNAL_FIELDS = ['doubleTap', 'tripleTap', 'quadTap'] as const;
const INPUT_SIGNAL_EVENT_LIMIT = 500;

export const INPUT_SIGNAL_MONITOR_FILE = path.join(config.dbFolder, 'input-signals.json');

// eslint-disable-next-line @typescript-eslint/no-type-alias
type InputSignalField = typeof INPUT_SIGNAL_FIELDS[number];
type InputSignalSnapshot = Partial<Record<InputSignalField, Record<string, number>>>;

export type InputSignalEvent = {
  id: string;
  observedAt: string;
  source: string;
  field: InputSignalField;
  channel: string;
  side: 'left' | 'right' | 'shared' | 'unknown';
  value: number;
  previousValue?: number;
  rawValue: Record<string, number>;
  rawDeviceStatusKeys: string[];
};

export type InputSignalMonitorData = {
  version: 1;
  updatedAt: string;
  lastSnapshot: InputSignalSnapshot;
  events: InputSignalEvent[];
};

type InputSignalEventFilter = {
  since?: number;
  until?: number;
  limit: number;
};

const defaultInputSignalMonitorData = (): InputSignalMonitorData => ({
  version: 1,
  updatedAt: new Date(0).toISOString(),
  lastSnapshot: {},
  events: [],
});

function parseRawDeviceStatusFields(response: string) {
  const fields: Record<string, string> = {};
  response.split(/\r?\n/).forEach(line => {
    const separatorIndex = line.indexOf(' = ');
    if (separatorIndex < 0) return;
    fields[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 3);
  });
  return fields;
}

function parseInputSignalValue(value: string): Record<string, number> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Input signal value is not an object: ${value}`);
  }

  return Object.fromEntries(
    Object.entries(parsed)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
  );
}

function extractInputSignalSnapshot(rawDeviceStatusResponse: string) {
  const fields = parseRawDeviceStatusFields(rawDeviceStatusResponse);
  const snapshot: InputSignalSnapshot = {};
  for (const field of INPUT_SIGNAL_FIELDS) {
    const value = fields[field];
    if (!value) continue;
    snapshot[field] = parseInputSignalValue(value);
  }
  return {
    rawDeviceStatusKeys: Object.keys(fields).sort(),
    snapshot,
  };
}

function inputSignalChannelToSide(channel: string): InputSignalEvent['side'] {
  if (channel === 'l') return 'left';
  if (channel === 'r') return 'right';
  if (channel === 's') return 'shared';
  return 'unknown';
}

function createInputSignalEvents(
  previousSnapshot: InputSignalSnapshot,
  snapshot: InputSignalSnapshot,
  source: string,
  observedAt: string,
  rawDeviceStatusKeys: string[],
) {
  const events: InputSignalEvent[] = [];
  for (const field of INPUT_SIGNAL_FIELDS) {
    const currentValue = snapshot[field];
    if (!currentValue) continue;

    const previousValue = previousSnapshot[field] ?? {};
    for (const [channel, value] of Object.entries(currentValue)) {
      if (previousValue[channel] === value) continue;
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

async function writeInputSignalMonitorData(data: InputSignalMonitorData) {
  await mkdir(path.dirname(INPUT_SIGNAL_MONITOR_FILE), { recursive: true });
  const temporaryPath = `${INPUT_SIGNAL_MONITOR_FILE}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(data, null, 2));
  await rename(temporaryPath, INPUT_SIGNAL_MONITOR_FILE);
}

export async function loadInputSignalMonitorData(): Promise<InputSignalMonitorData> {
  try {
    const contents = await readFile(INPUT_SIGNAL_MONITOR_FILE, 'utf8');
    const parsed = JSON.parse(contents) as InputSignalMonitorData;
    return {
      ...defaultInputSignalMonitorData(),
      ...parsed,
      lastSnapshot: parsed.lastSnapshot ?? {},
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultInputSignalMonitorData();
    }
    throw error;
  }
}

export function selectInputSignalEvents(events: InputSignalEvent[], filter: InputSignalEventFilter) {
  return events
    .filter(event => {
      const timestamp = Date.parse(event.observedAt) / 1_000;
      if (filter.since !== undefined && timestamp < filter.since) return false;
      return !(filter.until !== undefined && timestamp > filter.until);
    })
    .slice(-filter.limit);
}

export async function recordInputSignalSnapshot(rawDeviceStatusResponse: string, source: string) {
  const { rawDeviceStatusKeys, snapshot } = extractInputSignalSnapshot(rawDeviceStatusResponse);
  const monitorData = await loadInputSignalMonitorData();
  const observedAt = new Date().toISOString();

  if (Object.keys(monitorData.lastSnapshot).length === 0) {
    const initializedData: InputSignalMonitorData = {
      ...monitorData,
      updatedAt: observedAt,
      lastSnapshot: snapshot,
    };
    await writeInputSignalMonitorData(initializedData);
    return [];
  }

  const events = createInputSignalEvents(
    monitorData.lastSnapshot,
    snapshot,
    source,
    observedAt,
    rawDeviceStatusKeys,
  );

  if (events.length === 0) return [];

  const updatedData: InputSignalMonitorData = {
    ...monitorData,
    updatedAt: observedAt,
    lastSnapshot: snapshot,
    events: [...monitorData.events, ...events].slice(-INPUT_SIGNAL_EVENT_LIMIT),
  };
  await writeInputSignalMonitorData(updatedData);
  return events;
}
