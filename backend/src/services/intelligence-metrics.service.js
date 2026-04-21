/**
 * User Intelligence metrics (7.3.2) — rollup collections ONLY.
 * Never reads uis_events_raw.
 */

const { AppError } = require('../middlewares/error.middleware');
const IntelligenceAnalyticsRollupHourly = require('../models/intelligence-analytics-rollup-hourly.model');
const IntelligenceAnalyticsRollupDaily = require('../models/intelligence-analytics-rollup-daily.model');
const IntelligenceEventRaw = require('../models/intelligence-event-raw.model');
const PoiHourlyStats = require('../models/poi-hourly-stats.model');
const Poi = require('../models/poi.model');
const { POI_STATUS } = require('../constants/poi-status');

/** Metrics API: max window between start and end (inclusive span). */
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_TIME_MS = 2000;

// ⚙️ IMPLEMENTATION PART 3 — CONFIGURABLE THRESHOLDS
const LOW_THRESHOLD = 10;
const HIGH_THRESHOLD = 30;

/**
 * ⚙️ IMPLEMENTATION PART 1 — SIMPLE PREDICTION MODEL
 * Simple moving average using last 3 values.
 * @param {number[]} values 
 */
function predictNext(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    if (values.length < 3) return values[values.length - 1];

    const last3 = values.slice(-3);
    return last3.reduce((a, b) => a + b, 0) / 3;
}

/**
 * ⚙️ IMPLEMENTATION PART 3 — CLASSIFICATION
 * @param {number} value 
 */
function classifyTraffic(value) {
    if (value < LOW_THRESHOLD) return 'LOW';
    if (value < HIGH_THRESHOLD) return 'MEDIUM';
    return 'HIGH';
}

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
    /**
     * Aggregate geo heatmap points from raw events by POI.
     * Returns only approved/public POIs with valid coordinates.
     *
     * @param {{ start: string, end: string }} params
     * @returns {Promise<Array<{ poi_id: string, code: string, name: string, lat: number, lng: number, total_events: number }>>}
     */
    async getGeoHeatmap(params) {
        const { start, end } = parseIsoRange(params.start, params.end);

        // ⚙️ IMPLEMENTATION PART 2 — DATA PREPARATION (from PoiHourlyStats)
        // Step 1: Aggregate range totals from PoiHourlyStats instead of raw events for efficiency
        const statsAggregation = await PoiHourlyStats.aggregate([
            {
                $match: {
                    hour_bucket: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: '$poi_id',
                    total_visitors: { $sum: '$total_unique_visitors' }
                }
            }
        ]).option({ maxTimeMS: MAX_TIME_MS });

        const visitorsByPoi = new Map(statsAggregation.map(s => [String(s._id), s.total_visitors]));

        // Step 2: Fetch recent history for prediction (last 3-4 hours)
        const predictionWindowStart = new Date(Date.now() - 6 * 3600000);
        const historyStats = await PoiHourlyStats.find({
            hour_bucket: { $gte: predictionWindowStart }
        }).sort({ poi_id: 1, hour_bucket: 1 }).lean();

        const historyByPoi = new Map();
        for (const s of historyStats) {
            const pid = String(s.poi_id);
            if (!historyByPoi.has(pid)) historyByPoi.set(pid, []);
            historyByPoi.get(pid).push(s.total_unique_visitors);
        }

        // Step 3: Fetch POI details
        const pois = await Poi.find({
            $or: [
                { status: POI_STATUS.APPROVED },
                { status: { $exists: false } }
            ]
        }).select('_id code name location').lean();

        // ⚙️ IMPLEMENTATION PART 4 — API RESPONSE EXTENSION
        return pois
            .map((poi) => {
                const poiId = String(poi._id);
                if (!poi.location || !Array.isArray(poi.location.coordinates)) return null;

                const lng = Number(poi.location.coordinates[0]);
                const lat = Number(poi.location.coordinates[1]);
                if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

                const current = visitorsByPoi.get(poiId) || 0;
                const history = historyByPoi.get(poiId) || [0];
                const predicted = Math.round(predictNext(history));
                const level = classifyTraffic(predicted);

                return {
                    poi_id: poiId,
                    code: String(poi.code || ''),
                    name: String(poi.name || ''),
                    lat,
                    lng,
                    total_events: current, // Keep for backward compatibility with heatmap intensity
                    current,
                    predicted,
                    level
                };
            })
            .filter(Boolean);
    },
    MAX_RANGE_MS,
    MAX_TIME_MS
};
