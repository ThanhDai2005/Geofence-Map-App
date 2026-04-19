/**
 * User Intelligence metrics (7.3.2) — rollup collections ONLY.
 * Never reads uis_events_raw.
 */

const { AppError } = require('../middlewares/error.middleware');
const IntelligenceAnalyticsRollupHourly = require('../models/intelligence-analytics-rollup-hourly.model');
const IntelligenceAnalyticsRollupDaily = require('../models/intelligence-analytics-rollup-daily.model');

/** Metrics API: max window between start and end (inclusive span). */
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_TIME_MS = 2000;

function parseIsoRange(startStr, endStr) {
    if (!startStr || !endStr) {
        throw new AppError('Query params start and end are required (ISO 8601)', 400);
    }
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new AppError('start and end must be valid ISO 8601 dates', 400);
    }
    if (start > end) {
        throw new AppError('start must be before or equal to end', 400);
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
        throw new AppError('Time range must not exceed 90 days', 400);
    }
    return { start, end };
}

function resolveGranularity(value) {
    if (value == null || value === '' || value === 'daily') {
        return 'daily';
    }
    if (value === 'hourly') {
        return 'hourly';
    }
    throw new AppError('granularity must be hourly or daily', 400);
}

function rollupModel(granularity) {
    return granularity === 'hourly'
        ? IntelligenceAnalyticsRollupHourly
        : IntelligenceAnalyticsRollupDaily;
}

function matchStage(start, end) {
    return {
        $match: {
            bucket_start: { $gte: start, $lte: end }
        }
    };
}

/**
 * @param {{ start: string, end: string, granularity?: string }} params
 * @returns {Promise<Array<{ event_family: string, total_events: number }>>}
 */
async function getEventsByFamily(params) {
    const { start, end } = parseIsoRange(params.start, params.end);
    const granularity = resolveGranularity(params.granularity);
    const Model = rollupModel(granularity);

    const pipeline = [
        matchStage(start, end),
        {
            $group: {
                _id: '$event_family',
                total_events: { $sum: '$total_events' }
            }
        },
        { $sort: { _id: 1 } },
        {
            $project: {
                _id: 0,
                event_family: '$_id',
                total_events: 1
            }
        }
    ];

    return Model.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
}

/**
 * @param {{ start: string, end: string, granularity?: string }} params
 * @returns {Promise<Array<{ auth_state: string, total_events: number }>>}
 */
async function getEventsByAuthState(params) {
    const { start, end } = parseIsoRange(params.start, params.end);
    const granularity = resolveGranularity(params.granularity);
    const Model = rollupModel(granularity);

    const pipeline = [
        matchStage(start, end),
        {
            $group: {
                _id: '$auth_state',
                total_events: { $sum: '$total_events' }
            }
        },
        { $sort: { _id: 1 } },
        {
            $project: {
                _id: 0,
                auth_state: '$_id',
                total_events: 1
            }
        }
    ];

    return Model.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
}

/**
 * @param {{ start: string, end: string, granularity?: string }} params
 * @returns {Promise<Array<{ bucket_start: Date, total_events: number }>>}
 */
async function getTimeline(params) {
    const { start, end } = parseIsoRange(params.start, params.end);
    const granularity = resolveGranularity(params.granularity);
    const Model = rollupModel(granularity);

    const pipeline = [
        matchStage(start, end),
        {
            $group: {
                _id: '$bucket_start',
                total_events: { $sum: '$total_events' }
            }
        },
        { $sort: { _id: 1 } },
        {
            $project: {
                _id: 0,
                bucket_start: '$_id',
                total_events: 1
            }
        }
    ];

    return Model.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
}

module.exports = {
    getEventsByFamily,
    getEventsByAuthState,
    getTimeline,
    MAX_RANGE_MS,
    MAX_TIME_MS
};
