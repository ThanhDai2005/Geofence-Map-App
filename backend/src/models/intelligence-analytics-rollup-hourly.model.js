const mongoose = require('mongoose');

const ALLOWED_SOURCE = ['GAK', 'MSAL', 'NAV', 'ROEL'];
const ALLOWED_FAMILY = [
    'LocationEvent',
    'UserInteractionEvent',
    'NavigationEvent',
    'ObservabilityEvent'
];
const ALLOWED_AUTH = ['guest', 'logged_in', 'premium'];

const intelligenceAnalyticsRollupHourlySchema = new mongoose.Schema({
    bucket_start: { type: Date, required: true },
    event_family: { type: String, required: true, enum: ALLOWED_FAMILY },
    source_system: { type: String, required: true, enum: ALLOWED_SOURCE },
    auth_state: { type: String, required: true, enum: ALLOWED_AUTH },
    total_events: { type: Number, required: true, default: 0, min: 0 },
    created_at: { type: Date, required: true, default: () => new Date() },
    updated_at: { type: Date, required: true, default: () => new Date() }
}, {
    collection: 'uis_analytics_rollups_hourly',
    timestamps: false
});

intelligenceAnalyticsRollupHourlySchema.index(
    { bucket_start: 1, event_family: 1, source_system: 1, auth_state: 1 },
    { unique: true, name: 'uniq_bucket_dims_hourly' }
);
intelligenceAnalyticsRollupHourlySchema.index(
    { bucket_start: 1 },
    { name: 'ix_rollups_hourly_bucket_start' }
);

module.exports = mongoose.model(
    'IntelligenceAnalyticsRollupHourly',
    intelligenceAnalyticsRollupHourlySchema
);
