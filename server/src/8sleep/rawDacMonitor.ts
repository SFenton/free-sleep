import { randomUUID } from 'crypto';
import path from 'path';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import config from '../config.js';
import logger from '../logger.js';

const RAW_DAC_EVENT_LIMIT = 500;

export const RAW_DAC_MONITOR_FILE = path.join(config.dbFolder, 'raw-dac-messages.json');

export type RawDacEvent = {
  id: string;
  observedAt: string;
  direction: 'inbound' | 'outbound';
  source: string;
  bytes: number;
  message: string;
};

export type RawDacMonitorData = {
  version: 1;
  updatedAt: string;
  totalEventCount: number;
  events: RawDacEvent[];
};

type RawDacEventFilter = {
  since?: number;
  until?: number;
  limit: number;
};

type RawDacEventInput = Omit<RawDacEvent, 'id' | 'observedAt'>;

let cachedData: RawDacMonitorData | undefined;
let writeQueue = Promise.resolve();

const defaultRawDacMonitorData = (): RawDacMonitorData => ({
  version: 1,
  updatedAt: new Date(0).toISOString(),
  totalEventCount: 0,
  events: [],
});

async function writeRawDacMonitorData(data: RawDacMonitorData) {
  await mkdir(path.dirname(RAW_DAC_MONITOR_FILE), { recursive: true });
  const temporaryPath = `${RAW_DAC_MONITOR_FILE}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(data, null, 2));
  await rename(temporaryPath, RAW_DAC_MONITOR_FILE);
}

export async function loadRawDacMonitorData(): Promise<RawDacMonitorData> {
  if (cachedData) return cachedData;
  try {
    const contents = await readFile(RAW_DAC_MONITOR_FILE, 'utf8');
    const parsed = JSON.parse(contents) as RawDacMonitorData;
    cachedData = {
      ...defaultRawDacMonitorData(),
      ...parsed,
      events: Array.isArray(parsed.events) ? parsed.events : [],
      totalEventCount: parsed.totalEventCount ?? parsed.events?.length ?? 0,
    };
    return cachedData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      cachedData = defaultRawDacMonitorData();
      return cachedData;
    }
    throw error;
  }
}

export function recordRawDacEvent(input: RawDacEventInput) {
  writeQueue = writeQueue.then(async () => {
    const data = await loadRawDacMonitorData();
    const observedAt = new Date().toISOString();
    const nextData: RawDacMonitorData = {
      ...data,
      updatedAt: observedAt,
      totalEventCount: data.totalEventCount + 1,
      events: [
        ...data.events,
        {
          ...input,
          id: randomUUID(),
          observedAt,
        },
      ].slice(-RAW_DAC_EVENT_LIMIT),
    };
    cachedData = nextData;
    await writeRawDacMonitorData(nextData);
  }).catch(error => {
    logger.error('Failed to record raw DAC message');
    logger.error(error);
  });
}

export function selectRawDacEvents(events: RawDacEvent[], filter: RawDacEventFilter) {
  return events
    .filter(event => {
      const timestamp = Date.parse(event.observedAt) / 1_000;
      if (filter.since !== undefined && timestamp < filter.since) return false;
      return !(filter.until !== undefined && timestamp > filter.until);
    })
    .slice(-filter.limit);
}
