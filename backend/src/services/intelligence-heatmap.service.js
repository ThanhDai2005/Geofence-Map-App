/**
 * Intelligence heatmap — aggregates uis_events_raw by UTC calendar day + hour.
 * POI filter uses payload.poi_id (string or ObjectId stored in Mixed payload).
 */

const mongoose = require('mongoose');
const IntelligenceEventRaw = require('../models/intelligence-event-raw.model');
const Poi = require('../models/poi.model');
const { AppError } = require('../middlewares/error.middleware');

const MAX_RANGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_TIME_MS = 5000;

function defaultUtcDayRange7() {
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end };
}

/**
 * @param {string|undefined} startStr
 * @param {string|undefined} endStr
 */
function parseRange(startStr, endStr) {
    if (!startStr || !endStr) {
        return defaultUtcDayRange7();
    }
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new AppError('Invalid start or end (use ISO 8601)', 400);
    }
    if (start > end) {
        throw new AppError('start must be before or equal to end', 400);
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
        throw new AppError('Time range must not exceed 14 days', 400);
    }
    return { start, end };
}

/**
 * @param {Date} rangeStart
 * @param {Date} rangeEnd
 * @param {string|null} poiIdString optional — matches payload.poi_id
 * @returns {Promise<Array<{ date: string, hour: number, total_events: number }>>}
 */
async function aggregateHeatmap(rangeStart, rangeEnd, poiIdString) {
    /** @type {Record<string, unknown>} */
    const match = {
        created_at: { $gte: rangeStart, $lte: rangeEnd }
    };
    if (poiIdString) {
        const id = String(poiIdString);
        const branches = [{ 'payload.poi_id': id }];
        if (mongoose.Types.ObjectId.isValid(id)) {
            branches.push({ 'payload.poi_id': new mongoose.Types.ObjectId(id) });
        }
        match.$or = branches;
    }

    const pipeline = [
        { $match: match },
        {
            $addFields: {
                date: {
                    $dateToString: { format: '%Y-%m-%d', date: '$created_at', timezone: 'UTC' }
                },
                hour: { $hour: { date: '$created_at', timezone: 'UTC' } }
            }
        },
        {
            $group: {
                _id: { date: '$date', hour: '$hour' },
                total_events: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                date: '$_id.date',
                hour: '$_id.hour',
                total_events: 1
            }
        },
        { $sort: { date: 1, hour: 1 } }
    ];

    return IntelligenceEventRaw.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
}

/**
 * @param {{ start?: string, end?: string }} params
 */
async function getAdminHeatmap(params) {
    const { start, end } = parseRange(params.start, params.end);
    return aggregateHeatmap(start, end, null);
}

/**
 * @param {string} userId
 * @param {{ poi_id?: string, start?: string, end?: string }} params
 */
async function getOwnerHeatmap(userId, params) {
    const poiId = params.poi_id ?? params.poiId;
    if (poiId == null || String(poiId).trim() === '') {
        throw new AppError('Query param poi_id is required', 400);
    }
    if (!mongoose.Types.ObjectId.isValid(poiId)) {
        throw new AppError('Invalid poi_id', 400);
    }
    const poi = await Poi.findById(poiId).select('submittedBy').lean();
    if (!poi) {
        throw new AppError('POI not found', 404);
    }
    if (!poi.submittedBy || String(poi.submittedBy) !== String(userId)) {
        throw new AppError('You do not have access to this POI', 403);
    }
    const { start, end } = parseRange(params.start, params.end);
    return aggregateHeatmap(start, end, String(poi._id));
}

module.exports = {
    getAdminHeatmap,
    getOwnerHeatmap,
    parseRange,
    defaultUtcDayRange7,
    MAX_RANGE_MS,
    MAX_TIME_MS
};
