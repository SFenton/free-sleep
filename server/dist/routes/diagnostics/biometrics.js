import express from 'express';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import logger from '../../logger.js';
const router = express.Router();
const PERSISTENT_DIR = '/persistent';
const RAW_FILE_LIMIT = 20;
const DIRECTORY_ENTRY_LIMIT = 100;
const MAX_SCAN_DEPTH = 4;
let previousRawFiles = new Map();
function toAgeSeconds(modifiedAt, now) {
    return Math.round((now - modifiedAt.getTime()) / 1000);
}
async function getDirectoryEntrySnapshots() {
    const now = Date.now();
    const entries = await readdir(PERSISTENT_DIR, { withFileTypes: true });
    const snapshots = await Promise.all(entries.map(async (entry) => {
        const filePath = path.join(PERSISTENT_DIR, entry.name);
        const fileStat = await stat(filePath);
        return {
            name: entry.name,
            path: filePath,
            relativePath: entry.name,
            type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
            sizeBytes: fileStat.size,
            modifiedAt: fileStat.mtime.toISOString(),
            ageSeconds: toAgeSeconds(fileStat.mtime, now),
        };
    }));
    return snapshots.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
}
async function scanRawFiles(directory, depth, now, scanErrors) {
    const entries = await readdir(directory, { withFileTypes: true });
    const snapshots = await Promise.all(entries.map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (depth >= MAX_SCAN_DEPTH)
                return [];
            try {
                return await scanRawFiles(filePath, depth + 1, now, scanErrors);
            }
            catch (error) {
                scanErrors.push({
                    path: filePath,
                    message: error instanceof Error ? error.message : String(error),
                });
                return [];
            }
        }
        if (!entry.isFile() || !entry.name.endsWith('.RAW') || entry.name === 'SEQNO.RAW')
            return [];
        const fileStat = await stat(filePath);
        return [{
                name: entry.name,
                path: filePath,
                relativePath: path.relative(PERSISTENT_DIR, filePath),
                sizeBytes: fileStat.size,
                modifiedAt: fileStat.mtime.toISOString(),
                ageSeconds: toAgeSeconds(fileStat.mtime, now),
            }];
    }));
    return snapshots.flat();
}
async function getRawFileSnapshots() {
    const scanErrors = [];
    const rawFiles = await scanRawFiles(PERSISTENT_DIR, 0, Date.now(), scanErrors);
    return {
        rawFiles: rawFiles.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt)),
        scanErrors,
    };
}
router.get('/diagnostics/biometrics', async (_req, res) => {
    try {
        const rootEntries = await getDirectoryEntrySnapshots();
        const { rawFiles, scanErrors } = await getRawFileSnapshots();
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
            scanErrors,
            rawFiles: rawFiles.slice(0, RAW_FILE_LIMIT),
        });
    }
    catch (error) {
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
//# sourceMappingURL=biometrics.js.map