/**
 * Daily rollup: uis_analytics_rollups_hourly → uis_analytics_rollups_daily (7.3.2).
 * Watermark: uis_analytics_ingestion_cursors _id "raw_to_daily".
 *
 * Reads hourly rows directly (bucket_start > watermark), bounded batch.
 * Watermark advances only to MAX(hourly.bucket_start) among rows actually processed in the transaction.
 * No distinct() / no watermark advance on empty reads.
 *
 * Idempotency: daily $inc + cursor update in one transaction.
 */

const mongoose = require('mongoose');
const IntelligenceAnalyticsRollupHourly = require('../models/intelligence-analytics-rollup-hourly.model');
const IntelligenceAnalyticsRollupDaily = require('../models/intelligence-analytics-rollup-daily.model');
const IntelligenceAnalyticsIngestionCursor = require('../models/intelligence-analytics-ingestion-cursor.model');

const CURSOR_ID = 'raw_to_daily';
const EPOCH_START = new Date(0);
const DEFAULT_BATCH_LIMIT = 5000;
const BULK_CHUNK_SIZE = 500;
const DEFAULT_MAX_LOOPS = 10000;

function startOfUtcDay(d) {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
}

/**
 * @param {Map<string, { bucket_start: Date, event_family: string, source_system: string, auth_state: string, sum: number }>} groups
 * @param {Date} now
 */
function buildDailyBulkOps(groups, now) {
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
                    $inc: { total_events: g.sum },
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
 * @param {Array<Record<string, unknown>>} hourlyRows
 */
function groupHourlyRowsToDailyIncrements(hourlyRows) {
    /** @type {Map<string, { bucket_start: Date, event_family: string, source_system: string, auth_state: string, sum: number }>} */
    const map = new Map();
    for (const row of hourlyRows) {
        const hourBucket = row.bucket_start instanceof Date ? row.bucket_start : new Date(row.bucket_start);
        const dayStart = startOfUtcDay(hourBucket);
        const key = `${dayStart.getTime()}|${row.event_family}|${row.source_system}|${row.auth_state}`;
        const inc = typeof row.total_events === 'number' ? row.total_events : 0;
        const cur = map.get(key);
        if (cur) {
            cur.sum += inc;
        } else {
            map.set(key, {
                bucket_start: dayStart,
                event_family: String(row.event_family),
                source_system: String(row.source_system),
                auth_state: String(row.auth_state),
                sum: inc
            });
        }
    }
    return map;
}

/**
 * @param {Array<{ bucket_start: Date }>} rows
 */
function maxHourlyBucketStart(rows) {
    let maxT = -Infinity;
    let maxDate = null;
    for (const r of rows) {
        const d = r.bucket_start instanceof Date ? r.bucket_start : new Date(r.bucket_start);
        const t = d.getTime();
        if (t > maxT) {
            maxT = t;
            maxDate = d;
        }
    }
    return maxDate;
}

/**
 * @param {{ batchLimit?: number, maxLoops?: number, logger?: { info: Function, warn: Function }}} [options]
 * @returns {Promise<{ batches: number, hourlyRowsProcessed: number, bulkOps: number, completed: boolean }>}
 */
async function runDailyRollup(options = {}) {
    const batchLimit = options.batchLimit ?? DEFAULT_BATCH_LIMIT;
    const maxLoops = options.maxLoops ?? DEFAULT_MAX_LOOPS;
    const log = options.logger || console;

    let batches = 0;
    let hourlyRowsProcessed = 0;
    let bulkOps = 0;
    let loops = 0;

    while (loops < maxLoops) {
        loops += 1;

        const cursorDoc = await IntelligenceAnalyticsIngestionCursor.findById(CURSOR_ID).lean();
        const watermark = cursorDoc?.watermark_timestamp ?? EPOCH_START;

        const hourlyRows = await IntelligenceAnalyticsRollupHourly.find({
            bucket_start: { $gt: watermark }
        })
            .sort({
                bucket_start: 1,
                event_family: 1,
                source_system: 1,
                auth_state: 1
            })
            .limit(batchLimit)
            .select({ bucket_start: 1, event_family: 1, source_system: 1, auth_state: 1, total_events: 1 })
            .lean();

        if (hourlyRows.length === 0) {
            log.info?.(`[rollup-daily] idle watermark=${watermark.toISOString()} loops=${loops}`);
            return {
                batches,
                hourlyRowsProcessed,
                bulkOps,
                completed: true
            };
        }

        const maxProcessedBucket = maxHourlyBucketStart(hourlyRows);
        if (!maxProcessedBucket) {
            throw new Error('[rollup-daily] non-empty batch but could not compute max bucket_start');
        }

        if (hourlyRows.length === batchLimit) {
            const maxTs = maxProcessedBucket.getTime();
            const inBatchAtMax = hourlyRows.filter((r) => {
                const t = r.bucket_start instanceof Date ? r.bucket_start : new Date(r.bucket_start);
                return t.getTime() === maxTs;
            }).length;
            const totalAtMax = await IntelligenceAnalyticsRollupHourly.countDocuments({
                bucket_start: maxProcessedBucket
            });
            if (inBatchAtMax < totalAtMax) {
                throw new Error(
                    `[rollup-daily] batchLimit=${batchLimit} truncates hourly bucket `
                        + `${maxProcessedBucket.toISOString()} (read ${inBatchAtMax}/${totalAtMax} rows). `
                        + 'Increase batchLimit or add paging; refusing to advance watermark to prevent data loss.'
                );
            }
        }

        const groups = groupHourlyRowsToDailyIncrements(hourlyRows);
        const now = new Date();
        const ops = buildDailyBulkOps(groups, now);

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                for (let i = 0; i < ops.length; i += BULK_CHUNK_SIZE) {
                    const chunk = ops.slice(i, i + BULK_CHUNK_SIZE);
                    await IntelligenceAnalyticsRollupDaily.bulkWrite(chunk, {
                        ordered: false,
                        session
                    });
                }

                await IntelligenceAnalyticsIngestionCursor.findOneAndUpdate(
                    { _id: CURSOR_ID },
                    {
                        $set: {
                            watermark_timestamp: maxProcessedBucket,
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
        hourlyRowsProcessed += hourlyRows.length;
        bulkOps += ops.length;

        log.info?.(
            `[rollup-daily] batch=${batches} hourlyRows=${hourlyRows.length} groups=${ops.length} `
                + `watermark→=${maxProcessedBucket.toISOString()}`
        );
    }

    log.warn?.(`[rollup-daily] stopped: maxLoops=${maxLoops}`);
    return { batches, hourlyRowsProcessed, bulkOps, completed: false };
}

module.exports = {
    runDailyRollup,
    CURSOR_ID,
    DEFAULT_BATCH_LIMIT,
    startOfUtcDay,
    groupHourlyRowsToDailyIncrements,
    maxHourlyBucketStart
};
