const mongoose = require('mongoose');

const poiHourlyStatsSchema = new mongoose.Schema({
    poi_id: { type: String, required: true },
    hour_bucket: { type: Date, required: true },
    unique_devices: [{ type: String }],
    total_unique_visitors: { type: Number, default: 0 },
    updated_at: { type: Date, default: () => new Date() }
}, {
    collection: 'PoiHourlyStats',
    timestamps: false
});

poiHourlyStatsSchema.index({ poi_id: 1, hour_bucket: 1 }, { unique: true });

module.exports = mongoose.model('PoiHourlyStats', poiHourlyStatsSchema);