/**
 * Cron-driven intelligence rollups (7.3.2).
 *
 *   cd backend && npm run intelligence:rollup-scheduler
 *
 * Requires: MONGO_URI, MongoDB replica set (transactions).
 * Overlap: at most one hourly and one daily run at a time (per process).
 */

require('dotenv').config();

const cron = require('node-cron');
const connectDB = require('../config/db');
const { runHourlyRollup } = require('../services/intelligence-rollup-hourly.service');
const { runDailyRollup } = require('../services/intelligence-rollup-daily.service');

let hourlyBusy = false;
let dailyBusy = false;

async function guardedHourly(logger) {
    if (hourlyBusy) {
        (logger || console).info('[rollup-scheduler] hourly skipped (still running)');
        return;
    }
    hourlyBusy = true;
    const t0 = Date.now();
    (logger || console).info(`[rollup-scheduler] hourly START ${new Date().toISOString()}`);
    try {
        const result = await runHourlyRollup({ logger: logger || console });
        (logger || console).info(
            `[rollup-scheduler] hourly END ${Date.now() - t0}ms ${JSON.stringify(result)}`
        );
    } catch (err) {
        (logger || console).error('[rollup-scheduler] hourly ERROR', err);
    } finally {
        hourlyBusy = false;
    }
}

async function guardedDaily(logger) {
    if (dailyBusy) {
        (logger || console).info('[rollup-scheduler] daily skipped (still running)');
        return;
    }
    dailyBusy = true;
    const t0 = Date.now();
    (logger || console).info(`[rollup-scheduler] daily START ${new Date().toISOString()}`);
    try {
        const result = await runDailyRollup({ logger: logger || console });
        (logger || console).info(
            `[rollup-scheduler] daily END ${Date.now() - t0}ms ${JSON.stringify(result)}`
        );
    } catch (err) {
        (logger || console).error('[rollup-scheduler] daily ERROR', err);
    } finally {
        dailyBusy = false;
    }
}

/**
 * Registers cron jobs. Does not connect DB — call after connectDB().
 * @param {{ logger?: Console }} [opts]
 */
function registerIntelligenceRollupCronJobs(opts = {}) {
    const log = opts.logger || console;

    cron.schedule(
        '*/5 * * * *',
        () => {
            void guardedHourly(log);
        },
        { timezone: 'Etc/UTC' }
    );

    cron.schedule(
        '10 0 * * *',
        () => {
            void guardedDaily(log);
        },
        { timezone: 'Etc/UTC' }
    );

    log.info('[rollup-scheduler] registered: hourly */5 UTC, daily 00:10 UTC');
}

async function main() {
    const log = console;
    await connectDB();
    registerIntelligenceRollupCronJobs({ logger: log });
    log.info('[rollup-scheduler] running (Ctrl+C to stop)');
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[rollup-scheduler] fatal', err);
        process.exit(1);
    });
}

module.exports = {
    registerIntelligenceRollupCronJobs,
    guardedHourly,
    guardedDaily
};
