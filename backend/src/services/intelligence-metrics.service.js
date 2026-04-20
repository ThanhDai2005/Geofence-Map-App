/**
 * User Intelligence metrics (7.3.2) — rollup collections ONLY.
 * Never reads uis_events_raw.
 */

const { AppError } = require('../middlewares/error.middleware');
const IntelligenceAnalyticsRollupHourly = require('../models/intelligence-analytics-rollup-hourly.model');
const IntelligenceAnalyticsRollupDaily = require('../models/intelligence-analytics-rollup-daily.model');
const IntelligenceEventRaw = require('../models/intelligence-event-raw.model');
const Poi = require('../models/poi.model');
const { POI_STATUS } = require('../constants/poi-status');

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
    /**
     * Aggregate geo heatmap points from raw events by POI.
     * Returns only approved/public POIs with valid coordinates.
     *
     * @param {{ start: string, end: string }} params
     * @returns {Promise<Array<{ poi_id: string, code: string, name: string, lat: number, lng: number, total_events: number }>>}
     */
    async getGeoHeatmap(params) {
        const { start, end } = parseIsoRange(params.start, params.end);

        const grouped = await IntelligenceEventRaw.aggregate([
            {
                $match: {
                    created_at: { $gte: start, $lte: end }
                }
            },
            {
                $project: {
                    poi_id_raw: {
                        $ifNull: [
                            '$payload.poi_id',
                            {
                                $ifNull: [
                                    '$payload.poiId',
                                    {
                                        $ifNull: [
                                            '$payload.poi.id',
                                            { $ifNull: ['$payload.poi._id', null] }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    poi_code_raw: {
                        $ifNull: [
                            '$payload.poi_code',
                            {
                                $ifNull: [
                                    '$payload.poiCode',
                                    {
                                        $ifNull: [
                                            '$payload.code',
                                            { $ifNull: ['$payload.poi.code', null] }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    lat_raw: {
                        $ifNull: [
                            '$payload.lat',
                            {
                                $ifNull: [
                                    '$payload.latitude',
                                    {
                                        $ifNull: [
                                            '$payload.location.lat',
                                            {
                                                $ifNull: [
                                                    '$payload.location.latitude',
                                                    {
                                                        $ifNull: [
                                                            '$payload.location.coordinates.1',
                                                            {
                                                                $ifNull: [
                                                                    '$payload.coordinates.1',
                                                                    {
                                                                        $ifNull: [
                                                                            '$payload.geo.lat',
                                                                            '$payload.geo.latitude'
                                                                        ]
                                                                    }
                                                                ]
                                                            }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    lng_raw: {
                        $ifNull: [
                            '$payload.lng',
                            {
                                $ifNull: [
                                    '$payload.longitude',
                                    {
                                        $ifNull: [
                                            '$payload.location.lng',
                                            {
                                                $ifNull: [
                                                    '$payload.location.longitude',
                                                    {
                                                        $ifNull: [
                                                            '$payload.location.coordinates.0',
                                                            {
                                                                $ifNull: [
                                                                    '$payload.coordinates.0',
                                                                    {
                                                                        $ifNull: [
                                                                            '$payload.geo.lng',
                                                                            '$payload.geo.longitude'
                                                                        ]
                                                                    }
                                                                ]
                                                            }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }
            },
            {
                $match: {
                    $or: [
                        { poi_id_raw: { $exists: true, $ne: null } },
                        { poi_code_raw: { $exists: true, $ne: null } },
                        {
                            $and: [
                                { lat_raw: { $exists: true, $ne: null } },
                                { lng_raw: { $exists: true, $ne: null } }
                            ]
                        }
                    ]
                }
            },
            {
                $project: {
                    poi_id: {
                        $cond: [
                            { $ne: ['$poi_id_raw', null] },
                            { $toString: '$poi_id_raw' },
                            null
                        ]
                    },
                    poi_code: {
                        $cond: [
                            { $ne: ['$poi_code_raw', null] },
                            { $toString: '$poi_code_raw' },
                            null
                        ]
                    },
                    lat: {
                        $convert: {
                            input: '$lat_raw',
                            to: 'double',
                            onError: null,
                            onNull: null
                        }
                    },
                    lng: {
                        $convert: {
                            input: '$lng_raw',
                            to: 'double',
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },
            {
                $match: {
                    $or: [
                        { poi_id: { $nin: [null, '', 'null', 'undefined'] } },
                        { poi_code: { $nin: [null, '', 'null', 'undefined'] } },
                        {
                            $and: [
                                { lat: { $ne: null } },
                                { lng: { $ne: null } }
                            ]
                        }
                    ]
                }
            },
            {
                $group: {
                    _id: {
                        poi_id: '$poi_id',
                        poi_code: '$poi_code',
                        lat: '$lat',
                        lng: '$lng'
                    },
                    total_events: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    poi_id: '$_id.poi_id',
                    poi_code: '$_id.poi_code',
                    lat: '$_id.lat',
                    lng: '$_id.lng',
                    total_events: 1
                }
            },
            { $sort: { total_events: -1 } }
        ]).option({ maxTimeMS: MAX_TIME_MS });

        if (!Array.isArray(grouped) || grouped.length === 0) {
            return [];
        }

        const poiIds = grouped
            .map((x) => x.poi_id)
            .filter((id) => typeof id === 'string' && id.length === 24);
        const poiCodes = grouped
            .map((x) => (x.poi_code ? String(x.poi_code).trim() : ''))
            .filter((c) => c.length > 0);

        const hasPoiRefs = poiIds.length > 0 || poiCodes.length > 0;
        const pois = hasPoiRefs
            ? await Poi.find({
                $and: [
                    {
                        $or: [
                            ...(poiIds.length > 0 ? [{ _id: { $in: poiIds } }] : []),
                            ...(poiCodes.length > 0 ? [{ code: { $in: poiCodes } }] : [])
                        ]
                    },
                    {
                        $or: [
                            { status: POI_STATUS.APPROVED },
                            { status: { $exists: false } }
                        ]
                    }
                ]
            })
                .select('_id code name location')
                .lean()
            : [];

        const poiById = new Map(pois.map((p) => [String(p._id), p]));
        const poiByCode = new Map(pois.map((p) => [String(p.code || '').trim(), p]));

        return grouped
            .map((item) => {
                const poiFromId = item.poi_id ? poiById.get(String(item.poi_id)) : null;
                const poiFromCode = item.poi_code ? poiByCode.get(String(item.poi_code).trim()) : null;
                const poi = poiFromId || poiFromCode || null;

                let lng = null;
                let lat = null;
                let code = '';
                let name = '';
                let poiId = item.poi_id ? String(item.poi_id) : '';

                if (poi && poi.location && Array.isArray(poi.location.coordinates)) {
                    lng = Number(poi.location.coordinates[0]);
                    lat = Number(poi.location.coordinates[1]);
                    code = String(poi.code || item.poi_code || '');
                    name = String(poi.name || '');
                    poiId = String(poi._id);
                } else {
                    // Fallback: some events may carry raw coordinates but no poi reference
                    lng = Number(item.lng);
                    lat = Number(item.lat);
                    code = String(item.poi_code || '');
                    name = code ? `POI ${code}` : 'Unknown POI';
                }

                if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
                return {
                    poi_id: poiId,
                    code,
                    name,
                    lat,
                    lng,
                    total_events: Number(item.total_events) || 0
                };
            })
            .filter(Boolean);
    },
    MAX_RANGE_MS,
    MAX_TIME_MS
};
