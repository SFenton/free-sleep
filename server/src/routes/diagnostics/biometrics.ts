import express, { Request, Response } from 'express';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import logger from '../../logger.js';

const router = express.Router();

const PERSISTENT_DIR = '/persistent';
const RAW_FILE_LIMIT = 20;
const DIRECTORY_ENTRY_LIMIT = 100;

type RawFileSnapshot = {
  name: string;
  path: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
  ageSeconds: number;
};

type DirectoryEntrySnapshot = {
  name: string;
  path: string;
  relativePath: string;
  type: 'directory' | 'file' | 'other';
  sizeBytes: number;
  modifiedAt: string;
  ageSeconds: number;
};

let previousRawFiles = new Map<string, RawFileSnapshot>();

function toAgeSeconds(modifiedAt: Date, now: number) {
  return Math.round((now - modifiedAt.getTime()) / 1000);
}

async function getDirectoryEntrySnapshots(): Promise<DirectoryEntrySnapshot[]> {
  const now = Date.now();
  const entries = await readdir(PERSISTENT_DIR, { withFileTypes: true });
  const snapshots = await Promise.all(entries.map(async entry => {
    const filePath = path.join(PERSISTENT_DIR, entry.name);
    const fileStat = await stat(filePath);
    return {
      name: entry.name,
      path: filePath,
      relativePath: entry.name,
      type: entry.isDirectory() ? 'directory' as const : entry.isFile() ? 'file' as const : 'other' as const,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
      ageSeconds: toAgeSeconds(fileStat.mtime, now),
    };
  }));

  return snapshots.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
}

async function getRawFileSnapshots(): Promise<RawFileSnapshot[]> {
  const now = Date.now();
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
      ageSeconds: toAgeSeconds(fileStat.mtime, now),
    };
  }));

  return rawFiles.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
}

router.get('/diagnostics/biometrics', async (_req: Request, res: Response) => {
  try {
    const rootEntries = await getDirectoryEntrySnapshots();
    const rawFiles = await getRawFileSnapshots();
    const latestRawFile = rawFiles[0] ?? null;
    const previousLatestRawFile = latestRawFile ? previousRawFiles.get(latestRawFile.path) ?? null : null;
    const latestRawFileDelta = latestRawFile && previousLatestRawFile
      ? {
        sizeBytes: latestRawFile.sizeBytes - previousLatestRawFile.sizeBytes,
        modifiedAtChanged: latestRawFile.modifiedAt !== previousLatestRawFile.modifiedAt,
      }
      : null;

    previousRawFiles = new Map(rawFiles.map(file => [file.path, file]));

    res.json({
      timestamp: new Date().toISOString(),
      persistentDir: PERSISTENT_DIR,
      rawFileCount: rawFiles.length,
      rootEntries: rootEntries.slice(0, DIRECTORY_ENTRY_LIMIT),
      latestRawFile,
      previousLatestRawFile,
      latestRawFileDelta,
      rawFiles: rawFiles.slice(0, RAW_FILE_LIMIT),
    });
  } catch (error) {
    logger.error('Failed to read biometrics diagnostics');
    logger.error(error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

export default router;
