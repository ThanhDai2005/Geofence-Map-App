/**
 * Intelligence heatmap — aggregates uis_events_raw by UTC calendar day + hour.
 * POI filter uses payload.poi_id (string or ObjectId stored in Mixed payload).
 */

const mongoose = require('mongoose');
const PoiHourlyStats = require('../models/poi-hourly-stats.model');
const Poi = require('../models/poi.model');
const { AppError } = require('../middlewares/error.middleware');
const { POI_STATUS } = require('../constants/poi-status');

const MAX_RANGE_MS = 14 * 24 * 60 * 60 * 1000;
const OWNER_MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
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
function parseRange(startStr, endStr, opts = {}) {
    const maxRangeMs = opts.maxRangeMs || MAX_RANGE_MS;
    const defaultDays = Number.isInteger(opts.defaultDays) ? opts.defaultDays : 7;

    if (!startStr || !endStr) {
        const end = new Date();
        end.setUTCHours(23, 59, 59, 999);
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - (defaultDays - 1));
        start.setUTCHours(0, 0, 0, 0);
        return { start, end };
    }
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new AppError('Invalid start or end (use ISO 8601)', 400);
    }
    if (start > end) {
        throw new AppError('start must be before or equal to end', 400);
    }
    if (end.getTime() - start.getTime() > maxRangeMs) {
        throw new AppError(`Time range must not exceed ${Math.floor(maxRangeMs / (24 * 60 * 60 * 1000))} days`, 400);
    }
    return { start, end };
}

/**
 * @param {Date} rangeStart
 * @param {Date} rangeEnd
 * @param {string[]|null} poiIdStrings optional — matches poi_id
 * @returns {Promise<Array<{ date: string, hour: number, total_unique_visitors: number }>>}
 */
async function aggregateHeatmap(rangeStart, rangeEnd, poiIdStrings) {
    /** @type {Record<string, unknown>} */
    const match = {
        hour_bucket: { $gte: rangeStart, $lte: rangeEnd }
    };

    if (Array.isArray(poiIdStrings) && poiIdStrings.length > 0) {
        match.poi_id = { $in: poiIdStrings.map(String) };
    }

    const pipeline = [
        { $match: match },
        {
            $group: {
                _id: '$hour_bucket',
                total_unique_visitors: { $sum: { $size: { $ifNull: ['$unique_devices', []] } } }
            }
        },
        {
            $project: {
                _id: 0,
                date: {
                    $dateToString: { format: '%Y-%m-%d', date: '$_id', timezone: 'UTC' }
                },
                hour: { $hour: { date: '$_id', timezone: 'UTC' } },
                total_unique_visitors: 1
            }
        },
        { $sort: { date: 1, hour: 1 } }
    ];

    return PoiHourlyStats.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
}

/**
 * @param {{ start?: string, end?: string }} params
 */
async function getAdminHeatmap(params) {
    const { start, end } = parseRange(params.start, params.end, { maxRangeMs: MAX_RANGE_MS, defaultDays: 7 });
    return aggregateHeatmap(start, end, null);
}

/**
 * @param {string} userId
 * @param {{ poi_id?: string, start?: string, end?: string }} params
 */
async function getOwnerHeatmap(userId, params) {
    const rawPoiId = params.poi_id ?? params.poiId;
    const poiId = rawPoiId == null ? '' : String(rawPoiId).trim();

    if (poiId !== '' && !mongoose.Types.ObjectId.isValid(poiId)) {
        throw new AppError('Invalid poi_id', 400);
    }

    const baseOwnerFilter = {
        submittedBy: new mongoose.Types.ObjectId(String(userId)),
        status: POI_STATUS.APPROVED
    };

    const ownerFilter = poiId !== ''
        ? { ...baseOwnerFilter, _id: new mongoose.Types.ObjectId(poiId) }
        : baseOwnerFilter;

    const ownerPois = await Poi.find(ownerFilter).select('_id').lean();

    if (poiId !== '' && ownerPois.length === 0) {
        const ownPoi = await Poi.findById(poiId).select('_id submittedBy status').lean();
        if (!ownPoi) {
            throw new AppError('POI not found', 404);
        }
        if (!ownPoi.submittedBy || String(ownPoi.submittedBy) !== String(userId)) {
            throw new AppError('You do not have access to this POI', 403);
        }
        throw new AppError('POI must be APPROVED to show owner heatmap', 409);
    }

    if (ownerPois.length === 0) {
        return [];
    }

    const poiIds = ownerPois.map((p) => String(p._id));
    const { start, end } = parseRange(params.start, params.end, {
        maxRangeMs: OWNER_MAX_RANGE_MS,
        defaultDays: 365
    });
    return aggregateHeatmap(start, end, poiIds);
}

module.exports = {
    getAdminHeatmap,
    getOwnerHeatmap,
    parseRange,
    defaultUtcDayRange7,
    MAX_RANGE_MS,
    OWNER_MAX_RANGE_MS,
    MAX_TIME_MS
};
