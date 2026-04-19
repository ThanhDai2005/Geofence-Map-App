/**
 * Local-only seed for User Intelligence (MongoDB).
 *
 *   cd backend && node scripts/seed-intelligence-local.js
 *   cd backend && node scripts/seed-intelligence-local.js --clear
 *
 * Safety: aborts unless all hosts in MONGO_URI are localhost or 127.0.0.1 (no mongodb+srv).
 * Uses backend/.env (same as other scripts) and existing Mongoose config.
 */

const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const { ROLES } = require('../src/constants/roles');
const config = require('../src/config');

const User = require('../src/models/user.model');
const IntelligenceDeviceProfile = require('../src/models/intelligence-device-profile.model');
const IntelligenceUserProfile = require('../src/models/intelligence-user-profile.model');
const IntelligenceUserSession = require('../src/models/intelligence-user-session.model');
const IntelligenceEventRaw = require('../src/models/intelligence-event-raw.model');
const IntelligenceAnalyticsRollupHourly = require('../src/models/intelligence-analytics-rollup-hourly.model');
const IntelligenceAnalyticsRollupDaily = require('../src/models/intelligence-analytics-rollup-daily.model');
const IntelligenceAnalyticsIngestionCursor = require('../src/models/intelligence-analytics-ingestion-cursor.model');

const { runHourlyRollup } = require('../src/services/intelligence-rollup-hourly.service');
const { runDailyRollup } = require('../src/services/intelligence-rollup-daily.service');

const SOURCE_SYSTEMS = ['GAK', 'MSAL', 'NAV', 'ROEL'];
const EVENT_FAMILIES = [
    'LocationEvent',
    'UserInteractionEvent',
    'NavigationEvent',
    'ObservabilityEvent'
];
const EPOCH_START = new Date(0);
const RAW_EVENT_COUNT = 350;

function assertLocalMongoUri(uri) {
    if (!uri || typeof uri !== 'string') {
        throw new Error('[seed] MONGO_URI is missing');
    }
    if (/^mongodb\+srv:/i.test(uri)) {
        throw new Error('[seed] ABORT: mongodb+srv / Atlas is not allowed for this script');
    }
    if (!/^mongodb:\/\//i.test(uri)) {
        throw new Error('[seed] ABORT: expected mongodb:// URI for local seed');
    }
    const withoutScheme = uri.replace(/^mongodb:\/\//i, '');
    const authorityAndHosts = withoutScheme.split('/')[0];
    const hostSection = authorityAndHosts.includes('@')
        ? authorityAndHosts.split('@').slice(1).join('@')
        : authorityAndHosts;
    const hostList = hostSection.split(',').map((h) => h.trim());
    for (const entry of hostList) {
        const hostname = entry.split(':')[0].replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            throw new Error(
                `[seed] ABORT: non-local host "${hostname}" — only localhost / 127.0.0.1 allowed`
            );
        }
    }
}

function authStateForIndex(i) {
    const r = i % 10;
    if (r < 5) return 'guest';
    if (r < 9) return 'logged_in';
    return 'premium';
}

async function clearRollupAndRaw() {
    const db = mongoose.connection.db;
    console.log('[seed] --clear: dropping raw + rollup collections (not profiles/users)…');
    await db.collection('uis_events_raw').deleteMany({});
    await db.collection('uis_analytics_rollups_hourly').deleteMany({});
    await db.collection('uis_analytics_rollups_daily').deleteMany({});
    const now = new Date();
    await IntelligenceAnalyticsIngestionCursor.bulkWrite([
        {
            updateOne: {
                filter: { _id: 'raw_to_hourly' },
                update: {
                    $set: {
                        watermark_timestamp: EPOCH_START,
                        watermark_last_raw_id: null,
                        updated_at: now
                    }
                },
                upsert: true
            }
        },
        {
            updateOne: {
                filter: { _id: 'raw_to_daily' },
                update: {
                    $set: {
                        watermark_timestamp: EPOCH_START,
                        updated_at: now
                    }
                },
                upsert: true
            }
        }
    ]);
    console.log('[seed] --clear: ingestion cursors reset to epoch (raw_to_hourly / raw_to_daily)');
}

async function ensureUsers() {
    const users = [];
    for (let i = 0; i < 5; i += 1) {
        const email = `intel-seed-u${i}@local.test`;
        let doc = await User.findOne({ email }).lean();
        if (!doc) {
            doc = await User.create({
                email,
                fullName: `Intel Seed User ${i}`,
                password: 'Password123!',
                role: ROLES.USER
            });
            console.log('[seed] created User', email);
        } else {
            console.log('[seed] existing User', email);
        }
        users.push({ _id: String(doc._id), email });
    }
    return users;
}

async function ensureDevices(userIds) {
    const deviceIds = [];
    const now = new Date();
    for (let i = 0; i < 5; i += 1) {
        const device_id = `local-intel-seed-d${i}`;
        deviceIds.push(device_id);
        const linked_user_id = i < 3 ? userIds[i] : null;
        await IntelligenceDeviceProfile.findOneAndUpdate(
            { device_id },
            {
                $set: {
                    last_active_at: now,
                    linked_user_id,
                    guest_role: 'guest'
                },
                $setOnInsert: { device_id }
            },
            { upsert: true }
        );
        console.log('[seed] device profile', device_id, linked_user_id ? `linked=${linked_user_id}` : 'guest');
    }
    return deviceIds;
}

async function ensureUserProfiles(userIds, deviceIds) {
    const now = new Date();
    for (let i = 0; i < 3; i += 1) {
        const user_id = userIds[i];
        await IntelligenceUserProfile.findOneAndUpdate(
            { user_id },
            {
                $set: {
                    last_active_at: now,
                    role: i === 2 ? 'premium' : 'login',
                    device_ids: [deviceIds[i]]
                },
                $setOnInsert: { user_id }
            },
            { upsert: true }
        );
        console.log('[seed] user profile', user_id);
    }
}

async function ensureSessions(userIds, deviceIds) {
    const now = new Date();
    for (let i = 0; i < 10; i += 1) {
        const session_id = `local-intel-seed-sess-${i}`;
        const device_id = deviceIds[i % deviceIds.length];
        const user_id = i % 3 === 0 ? null : userIds[i % userIds.length];
        const start = new Date(now.getTime() - (i + 1) * 36 * 60 * 60 * 1000);
        await IntelligenceUserSession.findOneAndUpdate(
            { session_id },
            {
                $set: {
                    device_id,
                    user_id,
                    start_time: start,
                    last_seen: now,
                    auth_state_current: user_id ? 'logged_in' : 'guest',
                    auth_transitions: [],
                    correlation_ids_sample: []
                },
                $setOnInsert: { session_id }
            },
            { upsert: true }
        );
    }
    console.log('[seed] upserted 10 sessions (local-intel-seed-sess-0 … 9)');
}

function buildRawEvents(userIds, deviceIds) {
    const docs = [];
    const now = Date.now();
    for (let i = 0; i < RAW_EVENT_COUNT; i += 1) {
        const daysBack = i % 5;
        const hour = (i + daysBack * 2) % 24;
        const minute = (i * 11) % 60;
        const second = (i * 7) % 60;
        const created_at = new Date(now);
        created_at.setUTCDate(created_at.getUTCDate() - daysBack);
        created_at.setUTCHours(hour, minute, second, (i * 37) % 1000);

        const auth_state = authStateForIndex(i);
        const user_id = auth_state === 'guest' ? null : userIds[i % userIds.length];
        const device_id = deviceIds[i % deviceIds.length];
        const correlation_id = crypto.randomUUID();
        const source_system = SOURCE_SYSTEMS[i % SOURCE_SYSTEMS.length];
        const event_family = EVENT_FAMILIES[i % EVENT_FAMILIES.length];

        docs.push({
            correlation_id,
            device_id,
            user_id,
            auth_state,
            source_system,
            event_family,
            payload: { seed: true, i },
            rbel_mapping_version: 'rbel-seed-local',
            timestamp: created_at,
            created_at
        });
    }
    return docs;
}

async function main() {
    const doClear = process.argv.includes('--clear');

    assertLocalMongoUri(config.mongoUri);

    await mongoose.connect(config.mongoUri);
    const dbName = mongoose.connection.db?.databaseName;
    console.log('[seed] connected');
    console.log('[seed] database name:', dbName);

    if (doClear) {
        await clearRollupAndRaw();
    }

    const users = await ensureUsers();
    const userIds = users.map((u) => u._id);
    const deviceIds = await ensureDevices(userIds);
    await ensureUserProfiles(userIds, deviceIds);
    await ensureSessions(userIds, deviceIds);

    const rawDocs = buildRawEvents(userIds, deviceIds);
    await IntelligenceEventRaw.insertMany(rawDocs, { ordered: false });
    console.log(`[seed] inserted ${rawDocs.length} raw events (uis_events_raw)`);

    let hourlyResult = null;
    let dailyResult = null;
    try {
        console.log('[seed] running hourly rollup until idle…');
        hourlyResult = await runHourlyRollup({ maxLoops: 100000, logger: console });
        console.log('[seed] hourly rollup:', hourlyResult);

        console.log('[seed] running daily rollup until idle…');
        dailyResult = await runDailyRollup({ maxLoops: 100000, logger: console });
        console.log('[seed] daily rollup:', dailyResult);
    } catch (e) {
        const code = e && (e.code ?? e.errorResponse?.code);
        if (code === 20 || /replica set|transaction/i.test(String(e.message))) {
            console.error(
                '[seed] Rollup failed: MongoDB transactions are not available on this server '
                    + '(typical for standalone `mongod`). Hourly/daily rollups require a replica set. '
                    + 'Start Mongo as a single-node replica set, run `rs.initiate()`, then use a URI like '
                    + '`mongodb://127.0.0.1:27017/yourdb?replicaSet=rs0`. '
                    + 'Alternatively after seed: `cd backend && npm run intelligence:rollup-hourly` on an RS-enabled instance.'
            );
            console.error('[seed] Underlying error:', e.message);
        } else {
            throw e;
        }
    }

    const rawCount = await IntelligenceEventRaw.countDocuments();
    const hourlyCount = await IntelligenceAnalyticsRollupHourly.countDocuments();
    const dailyCount = await IntelligenceAnalyticsRollupDaily.countDocuments();

    console.log('[seed] VERIFY counts (entire DB, not only this run):');
    console.log('[seed]   uis_events_raw:', rawCount);
    console.log('[seed]   uis_analytics_rollups_hourly:', hourlyCount);
    console.log('[seed]   uis_analytics_rollups_daily:', dailyCount);

    await mongoose.disconnect();
    console.log('[seed] done');
}

main().catch(async (err) => {
    console.error('[seed] fatal:', err);
    try {
        await mongoose.disconnect();
    } catch (_) {
        /* ignore */
    }
    process.exit(1);
});
