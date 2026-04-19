/**
 * Idempotent: creates collections (implicit) and indexes for 7.3.2 rollup storage.
 * Safe to run multiple times.
 *
 * Usage (from repository backend folder):
 *   npm run intelligence:rollup-storage
 *
 * Requires: MONGO_URI in .env (same as server).
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const config = require('../src/config');

async function main() {
    const uri = config.mongoUri;
    if (!uri) {
        console.error('[rollup-storage] MONGO_URI is not set');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('[rollup-storage] Connected');

    // Load models (registers schemas + indexes)
    require('../src/models/intelligence-analytics-rollup-hourly.model');
    require('../src/models/intelligence-analytics-rollup-daily.model');
    require('../src/models/intelligence-analytics-ingestion-cursor.model');
    const IntelligenceEventRaw = require('../src/models/intelligence-event-raw.model');

    const models = [
        mongoose.model('IntelligenceAnalyticsRollupHourly'),
        mongoose.model('IntelligenceAnalyticsRollupDaily'),
        mongoose.model('IntelligenceAnalyticsIngestionCursor'),
        IntelligenceEventRaw
    ];

    for (const Model of models) {
        const name = Model.modelName;
        await Model.createIndexes();
        const idx = await Model.collection.indexes();
        console.log(`[rollup-storage] ${name}: ${idx.length} index(es)`);
    }

    console.log('[rollup-storage] Done');
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('[rollup-storage]', err);
    try {
        await mongoose.disconnect();
    } catch (_) { /* ignore */ }
    process.exit(1);
});
