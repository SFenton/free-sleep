import cbor from 'cbor';
import { readFileSync, statSync } from 'fs';
const DEFAULT_MAX_RAW_FILE_BYTES = 50 * 1024 * 1024;
const DEFAULT_LIMIT = 200;
const INPUT_RELATED_KEY = /button|gesture|input|press|tap|touch/i;
const GESTURE_FIELDS = ['doubleTap', 'tripleTap', 'quadTap'];
function printUsage() {
    process.stdout.write(`Usage:
  npm run diagnose:inputs:dev -- --device-status-file <raw-status.txt>
  npm run diagnose:inputs:dev -- --raw-file /persistent/<capture>.RAW --since <epoch-or-iso>

Options:
  --device-status-file <path>  Decode a captured raw Franken DEVICE_STATUS response.
  --raw-file <path>            Decode CBOR RAW records and print input-related records.
  --since <epoch-or-iso>       Include RAW records at or after this timestamp.
  --until <epoch-or-iso>       Include RAW records at or before this timestamp.
  --all-raw-records            Include every decoded RAW record, not just input-related records.
  --limit <count>              Maximum matching RAW records per file. Default: ${DEFAULT_LIMIT}.
  --max-raw-file-bytes <bytes> Maximum RAW file size to read. Default: ${DEFAULT_MAX_RAW_FILE_BYTES}.
  --help                       Show this help.

This tool is offline-only. It does not connect to the live Franken socket, so it is safe
to run without disrupting the Free Sleep service.
`);
}
function parseTimestamp(value) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
        return numericValue > 1_000_000_000_000 ? numericValue / 1_000 : numericValue;
    }
    const dateValue = Date.parse(value);
    if (Number.isNaN(dateValue)) {
        throw new Error(`Invalid timestamp: ${value}`);
    }
    return dateValue / 1_000;
}
function readRequiredArg(args, index, option) {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${option}`);
    }
    return value;
}
function parsePositiveInteger(value, option) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${option} must be a positive integer`);
    }
    return parsed;
}
function parseCliOptions(args) {
    const options = {
        deviceStatusFiles: [],
        rawFiles: [],
        allRawRecords: false,
        limit: DEFAULT_LIMIT,
        maxRawFileBytes: DEFAULT_MAX_RAW_FILE_BYTES,
    };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        switch (arg) {
            case '--device-status-file':
                options.deviceStatusFiles.push(readRequiredArg(args, index, arg));
                index += 1;
                break;
            case '--raw-file':
                options.rawFiles.push(readRequiredArg(args, index, arg));
                index += 1;
                break;
            case '--since':
                options.since = parseTimestamp(readRequiredArg(args, index, arg));
                index += 1;
                break;
            case '--until':
                options.until = parseTimestamp(readRequiredArg(args, index, arg));
                index += 1;
                break;
            case '--all-raw-records':
                options.allRawRecords = true;
                break;
            case '--limit':
                options.limit = parsePositiveInteger(readRequiredArg(args, index, arg), arg);
                index += 1;
                break;
            case '--max-raw-file-bytes':
                options.maxRawFileBytes = parsePositiveInteger(readRequiredArg(args, index, arg), arg);
                index += 1;
                break;
            case '--help':
            case '-h':
                printUsage();
                return undefined;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }
    if (options.deviceStatusFiles.length === 0 && options.rawFiles.length === 0) {
        printUsage();
        return undefined;
    }
    return options;
}
function parseRawDeviceStatusFields(response) {
    const fields = {};
    const unparsedLines = [];
    response.split(/\r?\n/).forEach(line => {
        if (!line.trim())
            return;
        const separatorIndex = line.indexOf(' = ');
        if (separatorIndex < 0) {
            unparsedLines.push(line);
            return;
        }
        const key = line.slice(0, separatorIndex);
        fields[key] = line.slice(separatorIndex + 3);
    });
    return { fields, unparsedLines };
}
function decodeJsonField(value) {
    return JSON.parse(value);
}
function decodeHexCborField(value) {
    const hexValue = value.replace(/"/g, '');
    return cbor.decode(Buffer.from(hexValue, 'hex'));
}
function normalizeForJson(value) {
    if (Buffer.isBuffer(value)) {
        return { encoding: 'hex', value: value.toString('hex') };
    }
    if (value instanceof Uint8Array) {
        return { encoding: 'hex', value: Buffer.from(value).toString('hex') };
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (value instanceof Map) {
        return Object.fromEntries(Array.from(value.entries()).map(([key, mapValue]) => [String(key), normalizeForJson(mapValue)]));
    }
    if (Array.isArray(value)) {
        return value.map(item => normalizeForJson(item));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, objectValue]) => [key, normalizeForJson(objectValue)]));
    }
    return value;
}
function diagnoseDeviceStatusFile(file) {
    const rawResponse = readFileSync(file, 'utf8');
    const { fields, unparsedLines } = parseRawDeviceStatusFields(rawResponse);
    const decodedGestureFields = {};
    const warnings = [];
    for (const field of GESTURE_FIELDS) {
        const value = fields[field];
        if (!value)
            continue;
        try {
            decodedGestureFields[field] = normalizeForJson(decodeJsonField(value));
        }
        catch (error) {
            warnings.push({
                file,
                message: `Unable to decode ${field} JSON: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }
    const inputRelatedFields = Object.fromEntries(Object.entries(fields).filter(([key]) => INPUT_RELATED_KEY.test(key)));
    const diagnostic = {
        file,
        fields,
        decodedGestureFields,
        inputRelatedFields,
        unparsedLines,
        warnings,
    };
    if (fields.settings) {
        try {
            diagnostic.decodedSettings = normalizeForJson(decodeHexCborField(fields.settings));
        }
        catch (error) {
            warnings.push({
                file,
                message: `Unable to decode settings CBOR: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }
    return diagnostic;
}
function isRecordObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function hasDataBuffer(value) {
    if (!isRecordObject(value))
        return false;
    const data = value.data;
    return Buffer.isBuffer(data) || data instanceof Uint8Array;
}
function decodeInnerRecord(outerRecord) {
    if (!hasDataBuffer(outerRecord))
        return outerRecord;
    return cbor.decode(Buffer.from(outerRecord.data));
}
function getRecordTimestamp(record) {
    if (!isRecordObject(record))
        return undefined;
    const timestamp = record.ts ?? record.timestamp ?? record.time;
    if (typeof timestamp === 'number' && Number.isFinite(timestamp))
        return timestamp;
    if (typeof timestamp === 'string') {
        try {
            return parseTimestamp(timestamp);
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}
function isInputRelatedRecord(record) {
    if (!isRecordObject(record))
        return false;
    const type = record.type;
    if (typeof type === 'string' && INPUT_RELATED_KEY.test(type))
        return true;
    return Object.keys(record).some(key => INPUT_RELATED_KEY.test(key));
}
function isInTimestampRange(record, options) {
    const timestamp = getRecordTimestamp(record);
    if (timestamp === undefined)
        return options.since === undefined && options.until === undefined;
    if (options.since !== undefined && timestamp < options.since)
        return false;
    return !(options.until !== undefined && timestamp > options.until);
}
async function collectDecodedOuterRecords(buffer, file) {
    const warnings = [];
    const outerRecords = [];
    const decoder = new cbor.Decoder();
    decoder.on('data', (outerRecord) => {
        outerRecords.push(outerRecord);
    });
    decoder.on('error', (error) => {
        warnings.push({
            file,
            message: error instanceof Error ? error.message : String(error),
        });
    });
    await new Promise((resolve, reject) => {
        decoder.on('finish', resolve);
        decoder.on('close', resolve);
        decoder.on('error', () => {
            // Decoder errors are recorded above; keep processing what could be decoded.
        });
        try {
            decoder.end(buffer);
        }
        catch (error) {
            reject(error);
        }
    });
    return { outerRecords, warnings };
}
async function diagnoseRawFile(file, options) {
    const stat = statSync(file);
    if (stat.size > options.maxRawFileBytes) {
        return {
            file,
            sizeBytes: stat.size,
            matchedRecords: [],
            decodedRecordCount: 0,
            matchedRecordCount: 0,
            warnings: [{
                    file,
                    message: `Skipping RAW file because size ${stat.size} exceeds --max-raw-file-bytes ${options.maxRawFileBytes}`,
                }],
        };
    }
    const buffer = readFileSync(file);
    const { outerRecords, warnings } = await collectDecodedOuterRecords(buffer, file);
    const matchedRecords = [];
    let matchedRecordCount = 0;
    for (const outerRecord of outerRecords) {
        let innerRecord;
        try {
            innerRecord = decodeInnerRecord(outerRecord);
        }
        catch (error) {
            warnings.push({
                file,
                message: `Unable to decode inner CBOR record: ${error instanceof Error ? error.message : String(error)}`,
            });
            continue;
        }
        const shouldInclude = options.allRawRecords || (isInputRelatedRecord(innerRecord) && isInTimestampRange(innerRecord, options));
        if (!shouldInclude)
            continue;
        matchedRecordCount += 1;
        if (matchedRecords.length < options.limit) {
            matchedRecords.push(normalizeForJson(innerRecord));
        }
    }
    return {
        file,
        sizeBytes: stat.size,
        matchedRecords,
        decodedRecordCount: outerRecords.length,
        matchedRecordCount,
        warnings,
    };
}
async function main() {
    const options = parseCliOptions(process.argv.slice(2));
    if (!options)
        return;
    const deviceStatusDiagnostics = options.deviceStatusFiles.map(file => diagnoseDeviceStatusFile(file));
    const rawFileDiagnostics = [];
    for (const file of options.rawFiles) {
        rawFileDiagnostics.push(await diagnoseRawFile(file, options));
    }
    process.stdout.write(`${JSON.stringify({
        generatedAt: new Date().toISOString(),
        deviceStatusDiagnostics,
        rawFileDiagnostics,
    }, null, 2)}\n`);
}
main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
//# sourceMappingURL=inputSignalDiagnostics.js.map