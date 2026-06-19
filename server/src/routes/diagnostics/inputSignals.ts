import express, { Request, Response } from 'express';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { connectFranken } from '../../8sleep/frankenServer.js';
import logger from '../../logger.js';
import {
  DEFAULT_LIMIT,
  DEFAULT_MAX_RAW_FILE_BYTES,
  diagnoseDeviceStatusResponse,
  diagnoseRawFile,
  DiagnosticWarning,
  parseTimestamp,
} from '../../tools/inputSignalDiagnostics.js';
import {
  INPUT_SIGNAL_MONITOR_FILE,
  loadInputSignalMonitorData,
  selectInputSignalEvents,
} from '../../8sleep/inputSignalMonitor.js';

const router = express.Router();

const PERSISTENT_DIR = '/persistent';
const DEFAULT_RAW_FILE_COUNT = 1;
const MAX_RAW_FILE_COUNT = 5;
const MAX_LIMIT = 1_000;
const DEFAULT_EVENT_LIMIT = 100;

type RawFileSnapshot = {
  name: string;
  path: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
};

type InputSignalDiagnosticsQuery = {
  since?: string;
  until?: string;
  allRawRecords?: string;
  limit?: string;
  eventLimit?: string;
  rawFileCount?: string;
  maxRawFileBytes?: string;
};

function parseBooleanQuery(value: string | undefined) {
  if (value === undefined) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parsePositiveIntegerQuery(value: string | undefined, defaultValue: number, maxValue: number, field: string) {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Math.min(parsed, maxValue);
}

function parseDiagnosticsQuery(query: InputSignalDiagnosticsQuery) {
  return {
    since: query.since ? parseTimestamp(query.since) : undefined,
    until: query.until ? parseTimestamp(query.until) : undefined,
    allRawRecords: parseBooleanQuery(query.allRawRecords),
    limit: parsePositiveIntegerQuery(query.limit, DEFAULT_LIMIT, MAX_LIMIT, 'limit'),
    eventLimit: parsePositiveIntegerQuery(query.eventLimit, DEFAULT_EVENT_LIMIT, MAX_LIMIT, 'eventLimit'),
    rawFileCount: parsePositiveIntegerQuery(query.rawFileCount, DEFAULT_RAW_FILE_COUNT, MAX_RAW_FILE_COUNT, 'rawFileCount'),
    maxRawFileBytes: parsePositiveIntegerQuery(
      query.maxRawFileBytes,
      DEFAULT_MAX_RAW_FILE_BYTES,
      DEFAULT_MAX_RAW_FILE_BYTES,
      'maxRawFileBytes'
    ),
  };
}

async function getLatestRawFiles(limit: number): Promise<RawFileSnapshot[]> {
  const entries = await readdir(PERSISTENT_DIR, { withFileTypes: true });
  const rawEntries = entries.filter(entry => entry.isFile() && entry.name.endsWith('.RAW') && entry.name !== 'SEQNO.RAW');
  const rawFiles = await Promise.all(rawEntries.map(async entry => {
    const filePath = path.join(PERSISTENT_DIR, entry.name);
    const fileStat = await stat(filePath);
    return {
      name: entry.name,
      path: filePath,
      relativePath: path.relative(PERSISTENT_DIR, filePath),
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    };
  }));

  return rawFiles.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt)).slice(0, limit);
}

router.get(
  '/diagnostics/inputSignals',
  async (req: Request<object, object, object, InputSignalDiagnosticsQuery>, res: Response) => {
    let options: ReturnType<typeof parseDiagnosticsQuery>;
    try {
      options = parseDiagnosticsQuery(req.query);
    } catch (error) {
      res.status(400).json({
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return;
    }

    const warnings: DiagnosticWarning[] = [];
    try {
      let deviceStatusDiagnostic = null;
      try {
        const franken = await connectFranken();
        const rawDeviceStatusResponse = await franken.getRawDeviceStatusResponse();
        deviceStatusDiagnostic = diagnoseDeviceStatusResponse('franken:DEVICE_STATUS', rawDeviceStatusResponse);
      } catch (error) {
        warnings.push({
          message: `Unable to capture raw DEVICE_STATUS response: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      const rawFiles = await getLatestRawFiles(options.rawFileCount);
      const rawFileDiagnostics = [];
      for (const rawFile of rawFiles) {
        rawFileDiagnostics.push(await diagnoseRawFile(rawFile.path, options));
      }
      const inputSignalMonitorData = await loadInputSignalMonitorData();
      const recordedEvents = selectInputSignalEvents(inputSignalMonitorData.events, {
        since: options.since,
        until: options.until,
        limit: options.eventLimit,
      });

      res.json({
        timestamp: new Date().toISOString(),
        options,
        warnings,
        deviceStatusDiagnostic,
        monitoring: {
          file: INPUT_SIGNAL_MONITOR_FILE,
          updatedAt: inputSignalMonitorData.updatedAt,
          lastSnapshot: inputSignalMonitorData.lastSnapshot,
          totalEventCount: inputSignalMonitorData.events.length,
          returnedEventCount: recordedEvents.length,
          events: recordedEvents,
        },
        rawFiles,
        rawFileDiagnostics,
      });
    } catch (error) {
      logger.error('Failed to read input signal diagnostics');
      logger.error(error);
      res.status(500).json({
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
);

export default router;
