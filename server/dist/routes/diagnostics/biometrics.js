import express from 'express';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import logger from '../../logger.js';
const router = express.Router();
const PERSISTENT_DIR = '/persistent';
const RAW_FILE_LIMIT = 20;
let previousRawFiles = new Map();
async function getRawFileSnapshots() {
    const now = Date.now();
    const names = await readdir(PERSISTENT_DIR);
    const rawNames = names.filter(name => name.endsWith('.RAW') && name !== 'SEQNO.RAW');
    const snapshots = await Promise.all(rawNames.map(async (name) => {
        const filePath = path.join(PERSISTENT_DIR, name);
        const fileStat = await stat(filePath);
        return {
            name,
            path: filePath,
            sizeBytes: fileStat.size,
            modifiedAt: fileStat.mtime.toISOString(),
            ageSeconds: Math.round((now - fileStat.mtime.getTime()) / 1000),
        };
    }));
    return snapshots.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
}
router.get('/diagnostics/biometrics', async (_req, res) => {
    try {
        const rawFiles = await getRawFileSnapshots();
        const latestRawFile = rawFiles[0] ?? null;
        const previousLatestRawFile = latestRawFile ? previousRawFiles.get(latestRawFile.name) ?? null : null;
        const latestRawFileDelta = latestRawFile && previousLatestRawFile
            ? {
                sizeBytes: latestRawFile.sizeBytes - previousLatestRawFile.sizeBytes,
                modifiedAtChanged: latestRawFile.modifiedAt !== previousLatestRawFile.modifiedAt,
            }
            : null;
        previousRawFiles = new Map(rawFiles.map(file => [file.name, file]));
        res.json({
            timestamp: new Date().toISOString(),
            persistentDir: PERSISTENT_DIR,
            rawFileCount: rawFiles.length,
            latestRawFile,
            previousLatestRawFile,
            latestRawFileDelta,
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