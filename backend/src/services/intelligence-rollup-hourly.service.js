/**
 * Hourly rollup: uis_events_raw → uis_analytics_rollups_hourly (7.3.2).
 * Watermark: uis_analytics_ingestion_cursors _id "raw_to_hourly".
 *
 * Idempotency: rollup $inc + cursor advance commit in one transaction.
 * Tie-break: watermark_timestamp + watermark_last_raw_id for duplicate created_at.
 */

const mongoose = require('mongoose');
const IntelligenceEventRaw = require('../models/intelligence-event-raw.model');
const IntelligenceAnalyticsRollupHourly = require('../models/intelligence-analytics-rollup-hourly.model');
const IntelligenceAnalyticsIngestionCursor = require('../models/intelligence-analytics-ingestion-cursor.model');

const CURSOR_ID = 'raw_to_hourly';
const EPOCH_START = new Date(0);
const DEFAULT_BATCH_LIMIT = 5000;
const BULK_CHUNK_SIZE = 500;

const ALLOWED_SOURCE = new Set(['GAK', 'MSAL', 'NAV', 'ROEL']);
const ALLOWED_FAMILY = new Set([
    'LocationEvent',
    'UserInteractionEvent',
    'NavigationEvent',
    'ObservabilityEvent'
]);
const ALLOWED_AUTH = new Set(['guest', 'logged_in', 'premium']);

function startOfUtcHour(d) {
    const x = new Date(d);
    x.setUTCMilliseconds(0);
    x.setUTCSeconds(0);
    x.setUTCMinutes(0);
    return x;
}

function normalizeDimension(value, allowed, fallback) {
    if (value != null && allowed.has(String(value))) {
        return String(value);
    }
    return fallback;
}

/**
 * @param {Date} watermarkTimestamp
 * @param {import('mongoose').Types.ObjectId | null|undefined} watermarkLastRawId
 */
function buildRawQuery(watermarkTimestamp, watermarkLastRawId) {
    if (!watermarkLastRawId) {
        return { created_at: { $gt: watermarkTimestamp } };
    }
    return {
        $or: [
            { created_at: { $gt: watermarkTimestamp } },
            {
                created_at: watermarkTimestamp,
                _id: { $gt: watermarkLastRawId }
            }
        ]
    };
}

/**
 * Group raw docs into Map key -> { bucket_start, event_family, source_system, auth_state, count }
 * @param {Array<Record<string, unknown>>} batch
 */
function groupBatch(batch) {
    /** @type {Map<string, { bucket_start: Date, event_family: string, source_system: string, auth_state: string, count: number }>} */
    const map = new Map();
    for (const doc of batch) {
        const createdAt = doc.created_at instanceof Date ? doc.created_at : new Date(doc.created_at);
        const bucketStart = startOfUtcHour(createdAt);
        const eventFamily = normalizeDimension(doc.event_family, ALLOWED_FAMILY, 'ObservabilityEvent');
        const sourceSystem = normalizeDimension(doc.source_system, ALLOWED_SOURCE, 'ROEL');
        const authState = normalizeDimension(doc.auth_state, ALLOWED_AUTH, 'guest');
        const key = `${bucketStart.getTime()}|${eventFamily}|${sourceSystem}|${authState}`;
        const cur = map.get(key);
        if (cur) {
            cur.count += 1;
        } else {
            map.set(key, {
                bucket_start: bucketStart,
                event_family: eventFamily,
                source_system: sourceSystem,
                auth_state: authState,
                count: 1
            });
        }
    }
    return map;
}

/**
 * @param {Map<string, { bucket_start: Date, event_family: string, source_system: string, auth_state: string, count: number }>} groups
 * @param {Date} now
 */
function buildBulkOps(groups, now) {
    const ops = [];
    for (const g of groups.values()) {
        ops.push({
            updateOne: {
                filter: {
                    bucket_start: g.bucket_start,
                    event_family: g.event_family,
                    source_system: g.source_system,
                    auth_state: g.auth_state
                },
                update: {
                    $inc: { total_events: g.count },
                    $set: { updated_at: now },
                    $setOnInsert: {
                        bucket_start: g.bucket_start,
                        event_family: g.event_family,
                        source_system: g.source_system,
                        auth_state: g.auth_state,
                        created_at: now
                    }
                },
                upsert: true
            }
        });
    }
    return ops;
}

/**
 * Run hourly rollup until no more raw rows match the watermark window.
 * @param {{ batchLimit?: number, maxLoops?: number, logger?: { info: Function, warn: Function }}} [options]
 * @returns {Promise<{ batches: number, eventsProcessed: number, bulkOps: number, completed: boolean }>}
 */
async function runHourlyRollup(options = {}) {
    const batchLimit = options.batchLimit ?? DEFAULT_BATCH_LIMIT;
    const maxLoops = options.maxLoops ?? 100000;
    const log = options.logger || console;

    let batches = 0;
    let eventsProcessed = 0;
    let bulkOps = 0;
    let loops = 0;

    while (loops < maxLoops) {
        loops += 1;

        const cursorDoc = await IntelligenceAnalyticsIngestionCursor.findById(CURSOR_ID).lean();
        const watermarkTimestamp = cursorDoc?.watermark_timestamp ?? EPOCH_START;
        const watermarkLastRawId = cursorDoc?.watermark_last_raw_id ?? null;

        const rawQuery = buildRawQuery(watermarkTimestamp, watermarkLastRawId);

        const batch = await IntelligenceEventRaw.find(rawQuery)
            .sort({ created_at: 1, _id: 1 })
            .limit(batchLimit)
            .select({ created_at: 1, event_family: 1, source_system: 1, auth_state: 1, _id: 1 })
            .lean();

        if (batch.length === 0) {
            log.info?.(`[rollup-hourly] idle watermark_ts=${watermarkTimestamp.toISOString()} loops=${loops}`);
            return {
                batches,
                eventsProcessed,
                bulkOps,
                completed: true
            };
        }

        const groups = groupBatch(batch);
        const now = new Date();
        const ops = buildBulkOps(groups, now);
        const last = batch[batch.length - 1];
        const lastCreatedAt = last.created_at instanceof Date ? last.created_at : new Date(last.created_at);

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                for (let i = 0; i < ops.length; i += BULK_CHUNK_SIZE) {
                    const chunk = ops.slice(i, i + BULK_CHUNK_SIZE);
                    await IntelligenceAnalyticsRollupHourly.bulkWrite(chunk, {
                        ordered: false,
                        session
                    });
                }

                await IntelligenceAnalyticsIngestionCursor.findOneAndUpdate(
                    { _id: CURSOR_ID },
                    {
                        $set: {
                            watermark_timestamp: lastCreatedAt,
                            watermark_last_raw_id: last._id,
                            updated_at: now
                        }
                    },
                    { upsert: true, session }
                );
            });
        } finally {
            await session.endSession();
        }

        batches += 1;
        eventsProcessed += batch.length;
        bulkOps += ops.length;

        log.info?.(
            `[rollup-hourly] batch=${batches} raw=${batch.length} groups=${ops.length} `
                + `watermark→ts=${lastCreatedAt.toISOString()} id=${String(last._id)}`
        );
    }

    log.warn?.(`[rollup-hourly] stopped: maxLoops=${maxLoops}`);
    return { batches, eventsProcessed, bulkOps, completed: false };
}

module.exports = {
    runHourlyRollup,
    CURSOR_ID,
    DEFAULT_BATCH_LIMIT,
    startOfUtcHour,
    buildRawQuery,
    groupBatch
};
