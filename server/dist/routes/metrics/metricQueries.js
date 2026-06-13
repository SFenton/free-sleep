import moment from 'moment-timezone';
import { prisma } from '../../db/prisma.js';
import { loadVitals } from '../../db/loadVitals.js';
import { loadMovementRecords } from '../../db/loadMovementRecords.js';
import { loadSleepRecords } from '../../db/loadSleepRecords.js';
import { SideSchema } from '../../db/schedulesSchema.js';
const loadBySide = async (loadRecord) => {
    const entries = await Promise.all(SideSchema.options.map(async (side) => [side, await loadRecord(side)]));
    return Object.fromEntries(entries);
};
export async function loadVitalsData({ side, startTime, endTime }) {
    const query = {};
    if (side)
        query.side = side;
    const timestampRange = {};
    if (startTime)
        timestampRange.gte = moment(startTime).unix();
    if (endTime)
        timestampRange.lte = moment(endTime).unix();
    if (Object.keys(timestampRange).length)
        query.timestamp = timestampRange;
    const vitals = await prisma.vitals.findMany({
        where: query,
        orderBy: { timestamp: 'asc' },
    });
    return loadVitals(vitals);
}
export async function loadVitalsSummaryData({ side, startTime, endTime }) {
    const query = {};
    if (side)
        query.side = side;
    const timestampRange = {};
    if (startTime)
        timestampRange.gte = moment(startTime).unix();
    if (endTime)
        timestampRange.lte = moment(endTime).unix();
    if (Object.keys(timestampRange).length)
        query.timestamp = timestampRange;
    const heartRateSummary = await prisma.vitals.aggregate({
        where: query,
        _min: { heart_rate: true },
        _max: { heart_rate: true },
        _avg: { heart_rate: true },
    });
    const avgBreathingRate = await prisma.vitals.aggregate({
        where: {
            ...query,
            breathing_rate: { not: 0, lte: 20, gte: 5 },
        },
        _avg: { breathing_rate: true },
    });
    const avgHRV = await prisma.vitals.aggregate({
        where: {
            ...query,
            hrv: { not: 0, lte: 120, gte: 30 },
        },
        _avg: { hrv: true },
    });
    return {
        avgHeartRate: Math.round(heartRateSummary._avg.heart_rate || 0),
        minHeartRate: Math.round(heartRateSummary._min.heart_rate || 0),
        maxHeartRate: Math.round(heartRateSummary._max.heart_rate || 0),
        avgHRV: Math.round(avgHRV._avg.hrv || 0),
        avgBreathingRate: Math.round(avgBreathingRate._avg.breathing_rate || 0),
    };
}
export async function loadMovementData({ side, startTime, endTime }) {
    const query = {};
    if (side)
        query.side = side;
    const timestampRange = {};
    if (startTime)
        timestampRange.gte = moment(startTime).unix();
    if (endTime)
        timestampRange.lte = moment(endTime).unix();
    if (Object.keys(timestampRange).length)
        query.timestamp = timestampRange;
    const movementRecords = await prisma.movement.findMany({
        where: query,
        orderBy: { timestamp: 'asc' },
    });
    return loadMovementRecords(movementRecords);
}
export async function loadSleepData({ startTime, endTime, side }) {
    const query = {};
    if (side)
        query.side = side;
    if (startTime)
        query.left_bed_at = { gte: moment(startTime).unix() };
    if (endTime)
        query.entered_bed_at = { lte: moment(endTime).unix() };
    const sleepRecords = await prisma.sleep_records.findMany({
        where: query,
        orderBy: { entered_bed_at: 'asc' },
    });
    return loadSleepRecords(sleepRecords);
}
export async function loadLatestVitalsBySide() {
    return loadBySide(async (side) => {
        const record = await prisma.vitals.findFirst({
            where: { side },
            orderBy: { timestamp: 'desc' },
        });
        if (!record)
            return null;
        const [loadedRecord] = await loadVitals([record]);
        return loadedRecord;
    });
}
export async function loadLatestMovementBySide() {
    return loadBySide(async (side) => {
        const record = await prisma.movement.findFirst({
            where: { side },
            orderBy: { timestamp: 'desc' },
        });
        if (!record)
            return null;
        const [loadedRecord] = await loadMovementRecords([record]);
        return loadedRecord;
    });
}
export async function loadLatestSleepBySide() {
    return loadBySide(async (side) => {
        const record = await prisma.sleep_records.findFirst({
            where: { side },
            orderBy: { entered_bed_at: 'desc' },
        });
        if (!record)
            return null;
        const [loadedRecord] = await loadSleepRecords([record]);
        return loadedRecord;
    });
}
//# sourceMappingURL=metricQueries.js.map