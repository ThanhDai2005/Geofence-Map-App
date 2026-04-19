const mongoose = require('mongoose');

/** Only these _id values are valid for uis_analytics_ingestion_cursors (7.3.2). */
const CURSOR_PROCESSOR_IDS = Object.freeze(['raw_to_hourly', 'raw_to_daily']);

const intelligenceAnalyticsIngestionCursorSchema = new mongoose.Schema({
    _id: { type: String, required: true, enum: [...CURSOR_PROCESSOR_IDS] },
    watermark_timestamp: { type: Date, required: true },
    /** Tie-break when many raw rows share the same `created_at` (exclusive cursor with `_id`). */
    watermark_last_raw_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    updated_at: { type: Date, required: true, default: () => new Date() }
}, {
    collection: 'uis_analytics_ingestion_cursors',
    timestamps: false,
    versionKey: false
});

const IntelligenceAnalyticsIngestionCursor = mongoose.model(
    'IntelligenceAnalyticsIngestionCursor',
    intelligenceAnalyticsIngestionCursorSchema
);

module.exports = IntelligenceAnalyticsIngestionCursor;
module.exports.CURSOR_PROCESSOR_IDS = CURSOR_PROCESSOR_IDS;
