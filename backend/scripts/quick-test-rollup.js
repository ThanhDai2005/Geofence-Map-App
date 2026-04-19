/**
 * One-click rollup smoke test (uses MONGO_URI from .env).
 *
 *   cd backend && npm run test:rollup
 */

const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const config = require('../src/config');
const IntelligenceEventRaw = require('../src/models/intelligence-event-raw.model');
const IntelligenceAnalyticsRollupHourly = require('../src/models/intelligence-analytics-rollup-hourly.model');

async function main() {
    if (!config.mongoUri) {
        console.error('[test:rollup] MONGO_URI missing');
        process.exit(1);
    }

    // 1. Connect to Mongoose
    await mongoose.connect(config.mongoUri);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const deviceId = `quick-test-rollup-${crypto.randomUUID()}`;

    // 2. Insert 2 fake events (timestamp + created_at = exactly 1 hour ago)
    await IntelligenceEventRaw.insertMany([
        {
            correlation_id: crypto.randomUUID(),
            device_id: deviceId,
            user_id: null,
            auth_state: 'guest',
            source_system: 'GAK',
            event_family: 'LocationEvent',
            payload: {},
            rbel_mapping_version: 'rbel-test',
            timestamp: oneHourAgo,
            created_at: oneHourAgo,
            runtime_sequence: 1
        },
        {
            correlation_id: crypto.randomUUID(),
            device_id: deviceId,
            user_id: null,
            auth_state: 'guest',
            source_system: 'GAK',
            event_family: 'LocationEvent',
            payload: {},
            rbel_mapping_version: 'rbel-test',
            timestamp: oneHourAgo,
            created_at: oneHourAgo,
            runtime_sequence: 2
        }
    ]);

    // 3–4. Require rollup service and await completion
    const { runHourlyRollup, startOfUtcHour } = require('../src/services/intelligence-rollup-hourly.service');
    const bucketStart = startOfUtcHour(oneHourAgo);
    await runHourlyRollup({ maxLoops: 10, logger: console });

    // 5. Fetch and log rollup rows for this test bucket / dimensions
    const rollupRows = await IntelligenceAnalyticsRollupHourly.find({
        bucket_start: bucketStart,
        event_family: 'LocationEvent',
        source_system: 'GAK',
        auth_state: 'guest'
    })
        .lean();

    console.log('[test:rollup] uis_analytics_rollups_hourly (matching test bucket/dims):');
    console.log(JSON.stringify(rollupRows, null, 2));

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('[test:rollup] fatal', err);
    try {
        await mongoose.disconnect();
    } catch (_) { /* ignore */ }
    process.exit(1);
});
