/**
 * One-shot hourly intelligence rollup (requires MONGO_URI, replica set for transactions).
 *
 *   cd backend && npm run intelligence:rollup-hourly
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const config = require('../src/config');
const { runHourlyRollup } = require('../src/services/intelligence-rollup-hourly.service');

async function main() {
    if (!config.mongoUri) {
        console.error('[rollup-hourly] MONGO_URI missing');
        process.exit(1);
    }
    await mongoose.connect(config.mongoUri);
    console.log('[rollup-hourly] connected');

    const result = await runHourlyRollup({ logger: console });
    console.log('[rollup-hourly] result', JSON.stringify(result));

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('[rollup-hourly] fatal', err);
    try {
        await mongoose.disconnect();
    } catch (_) { /* ignore */ }
    process.exit(1);
});
