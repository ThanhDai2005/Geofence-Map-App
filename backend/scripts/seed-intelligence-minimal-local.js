/**
 * Minimal local intelligence test data — inserts only (no transactions, no rollups).
 *
 *   cd backend && node scripts/seed-intelligence-minimal-local.js
 *
 * Raw events use source_system "mobile_app" via native collection insert (Mongoose
 * schema only allows GAK|MSAL|NAV|ROEL; this script does not change backend logic).
 */

const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const config = require('../src/config');
const { ROLES } = require('../src/constants/roles');

const User = require('../src/models/user.model');
const Poi = require('../src/models/poi.model');
const { POI_STATUS } = require('../src/constants/poi-status');
const IntelligenceDeviceProfile = require('../src/models/intelligence-device-profile.model');
const IntelligenceUserProfile = require('../src/models/intelligence-user-profile.model');
const IntelligenceUserSession = require('../src/models/intelligence-user-session.model');

const PREFIX = 'minimal-intel';
const RAW_COUNT = 35;
const HOURLY_FAKE = 10;
const DAILY_FAKE = 5;

function assertLocalMongoUri(uri) {
    if (!uri || typeof uri !== 'string') {
        throw new Error('[minimal-seed] MONGO_URI is missing');
    }
    if (/^mongodb\+srv:/i.test(uri)) {
        throw new Error('[minimal-seed] ABORT: mongodb+srv not allowed');
    }
    if (!/^mongodb:\/\//i.test(uri)) {
        throw new Error('[minimal-seed] ABORT: expected mongodb:// URI');
    }
    const withoutScheme = uri.replace(/^mongodb:\/\//i, '');
    const authorityAndHosts = withoutScheme.split('/')[0];
    const hostSection = authorityAndHosts.includes('@')
        ? authorityAndHosts.split('@').slice(1).join('@')
        : authorityAndHosts;
    for (const entry of hostSection.split(',').map((h) => h.trim())) {
        const hostname = entry.split(':')[0].replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            throw new Error(`[minimal-seed] ABORT: non-local host "${hostname}"`);
        }
    }
}

function hourUtc(d) {
    const x = new Date(d);
    x.setUTCMilliseconds(0);
    x.setUTCSeconds(0);
    x.setUTCMinutes(0);
    return x;
}

function dayUtc(d) {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
}

async function main() {
    assertLocalMongoUri(config.mongoUri);
    await mongoose.connect(config.mongoUri);
    const db = mongoose.connection.db;

    console.log('[minimal-seed] database:', db.databaseName);
    console.log('[minimal-seed] collections touched:', [
        'users',
        'uis_device_profiles',
        'uis_user_profiles',
        'uis_user_sessions',
        'uis_events_raw',
        'uis_analytics_rollups_hourly',
        'uis_analytics_rollups_daily'
    ].join(', '));

    const now = new Date();

    await db.collection('uis_events_raw').deleteMany({ 'payload.minimal_seed': true });
    await db.collection('uis_analytics_rollups_hourly').deleteMany({ seed_tag: PREFIX });
    await db.collection('uis_analytics_rollups_daily').deleteMany({ seed_tag: PREFIX });
    await Poi.deleteMany({ code: { $regex: /^heatmap-seed-/ } });

    const userIds = [];
    const ownerEmail = `${PREFIX}-owner@local.test`;
    let ownerUser = await User.findOne({ email: ownerEmail });
    if (!ownerUser) {
        ownerUser = await User.create({
            email: ownerEmail,
            fullName: 'Minimal Intel Owner',
            password: 'Password123!',
            role: ROLES.OWNER
        });
    }
    const ownerId = ownerUser._id;

    for (let i = 0; i < 3; i += 1) {
        const email = `${PREFIX}-u${i}@local.test`;
        let u = await User.findOne({ email });
        if (!u) {
            u = await User.create({
                email,
                fullName: `Minimal Intel ${i}`,
                password: 'Password123!',
                role: ROLES.USER
            });
        }
        userIds.push(String(u._id));
    }

    const heatmapPoiIds = [];
    for (let i = 0; i < 3; i += 1) {
        const code = `heatmap-seed-${i}-${Date.now().toString(36)}`;
        const p = await Poi.create({
            code,
            name: `Heatmap seed POI ${i}`,
            location: { type: 'Point', coordinates: [106.7 + i * 0.01, 10.77] },
            radius: 80,
            status: POI_STATUS.APPROVED,
            submittedBy: ownerId
        });
        heatmapPoiIds.push(String(p._id));
    }

    const deviceIds = [`${PREFIX}-d0`, `${PREFIX}-d1`, `${PREFIX}-d2`];
    for (let i = 0; i < deviceIds.length; i += 1) {
        const device_id = deviceIds[i];
        await IntelligenceDeviceProfile.findOneAndUpdate(
            { device_id },
            {
                $set: {
                    last_active_at: now,
                    linked_user_id: i < 2 ? userIds[i] : null,
                    guest_role: 'guest'
                },
                $setOnInsert: { device_id }
            },
            { upsert: true }
        );
    }

    for (let i = 0; i < 2; i += 1) {
        const user_id = userIds[i];
        await IntelligenceUserProfile.findOneAndUpdate(
            { user_id },
            {
                $set: {
                    last_active_at: now,
                    role: 'login',
                    device_ids: [deviceIds[i]]
                },
                $setOnInsert: { user_id }
            },
            { upsert: true }
        );
    }

    for (let i = 0; i < 5; i += 1) {
        const session_id = `${PREFIX}-sess-${i}`;
        await IntelligenceUserSession.findOneAndUpdate(
            { session_id },
            {
                $set: {
                    device_id: deviceIds[i % deviceIds.length],
                    user_id: i % 2 === 0 ? userIds[0] : null,
                    start_time: new Date(now.getTime() - (i + 1) * 60 * 60 * 1000),
                    last_seen: now,
                    auth_state_current: i % 2 === 0 ? 'logged_in' : 'guest',
                    auth_transitions: [],
                    correlation_ids_sample: []
                },
                $setOnInsert: { session_id }
            },
            { upsert: true }
        );
    }

    const rawDocs = [];
    for (let i = 0; i < RAW_COUNT; i += 1) {
        const daysBack = i % 3;
        const t = new Date(now);
        t.setUTCDate(t.getUTCDate() - daysBack);
        t.setUTCHours((i * 3) % 24, (i * 7) % 60, (i * 11) % 60, 0);
        const auth_state = i % 2 === 0 ? 'guest' : 'logged_in';
        const poiId = heatmapPoiIds[i % heatmapPoiIds.length];
        rawDocs.push({
            correlation_id: crypto.randomUUID(),
            device_id: deviceIds[i % deviceIds.length],
            user_id: auth_state === 'guest' ? null : userIds[i % userIds.length],
            auth_state,
            source_system: 'mobile_app',
            event_family: i % 2 === 0 ? 'LocationEvent' : 'NavigationEvent',
            payload: { minimal_seed: true, poi_id: poiId },
            rbel_mapping_version: 'minimal-local',
            timestamp: t,
            created_at: t
        });
    }
    await db.collection('uis_events_raw').insertMany(rawDocs, { ordered: false });

    const hourlyDocs = [];
    const families = ['LocationEvent', 'NavigationEvent'];
    const authStates = ['guest', 'logged_in'];
    for (let h = 0; h < HOURLY_FAKE; h += 1) {
        const bucket = hourUtc(new Date(now.getTime() - (h + 1) * 60 * 60 * 1000));
        hourlyDocs.push({
            bucket_start: bucket,
            event_family: families[h % families.length],
            source_system: 'mobile_app',
            auth_state: authStates[h % authStates.length],
            total_events: 10 + h * 3,
            created_at: now,
            updated_at: now,
            seed_tag: PREFIX
        });
    }
    await db.collection('uis_analytics_rollups_hourly').insertMany(hourlyDocs, { ordered: false });

    const dailyDocs = [];
    for (let d = 0; d < DAILY_FAKE; d += 1) {
        const bucket = dayUtc(new Date(now.getTime() - d * 24 * 60 * 60 * 1000));
        dailyDocs.push({
            bucket_start: bucket,
            event_family: 'LocationEvent',
            source_system: 'mobile_app',
            auth_state: 'guest',
            total_events: 50 + d * 10,
            created_at: now,
            updated_at: now,
            seed_tag: PREFIX
        });
    }
    await db.collection('uis_analytics_rollups_daily').insertMany(dailyDocs, { ordered: false });

    const counts = {
        users_this_seed: await db.collection('users').countDocuments({ email: { $regex: `^${PREFIX}-` } }),
        uis_device_profiles_this_seed: await db.collection('uis_device_profiles').countDocuments({
            device_id: { $in: deviceIds }
        }),
        uis_user_profiles_this_seed: await db.collection('uis_user_profiles').countDocuments({
            user_id: { $in: userIds.slice(0, 2) }
        }),
        uis_user_sessions_this_seed: await db.collection('uis_user_sessions').countDocuments({
            session_id: { $regex: `^${PREFIX}-sess-` }
        }),
        uis_events_raw_this_seed: await db.collection('uis_events_raw').countDocuments({
            'payload.minimal_seed': true
        }),
        uis_analytics_rollups_hourly_this_seed: await db.collection('uis_analytics_rollups_hourly').countDocuments({
            seed_tag: PREFIX
        }),
        uis_analytics_rollups_daily_this_seed: await db.collection('uis_analytics_rollups_daily').countDocuments({
            seed_tag: PREFIX
        })
    };

    console.log('\n[minimal-seed] heatmap POI ids (owner heatmap ?poi_id=):');
    console.log(heatmapPoiIds.join('\n'));

    console.log('\n[minimal-seed] counts (subset tied to this prefix where applicable):');
    console.log(JSON.stringify(counts, null, 2));

    const sampleRaw = await db.collection('uis_events_raw').findOne({ 'payload.minimal_seed': true });
    const sampleHourly = await db.collection('uis_analytics_rollups_hourly').findOne({ seed_tag: PREFIX });
    const sampleDaily = await db.collection('uis_analytics_rollups_daily').findOne({ seed_tag: PREFIX });
    const sampleDevice = await db.collection('uis_device_profiles').findOne({ device_id: deviceIds[0] });
    const sampleSession = await db.collection('uis_user_sessions').findOne({ session_id: `${PREFIX}-sess-0` });

    console.log('\n[minimal-seed] sample uis_events_raw:');
    console.log(JSON.stringify(sampleRaw, null, 2));
    console.log('\n[minimal-seed] sample uis_analytics_rollups_hourly:');
    console.log(JSON.stringify(sampleHourly, null, 2));
    console.log('\n[minimal-seed] sample uis_analytics_rollups_daily:');
    console.log(JSON.stringify(sampleDaily, null, 2));
    console.log('\n[minimal-seed] sample uis_device_profiles:');
    console.log(JSON.stringify(sampleDevice, null, 2));
    console.log('\n[minimal-seed] sample uis_user_sessions:');
    console.log(JSON.stringify(sampleSession, null, 2));

    const totalRaw = await db.collection('uis_events_raw').countDocuments();
    const totalHourly = await db.collection('uis_analytics_rollups_hourly').countDocuments();
    const totalDaily = await db.collection('uis_analytics_rollups_daily').countDocuments();
    console.log('\n[minimal-seed] total collection counts (entire DB):');
    console.log({
        uis_events_raw: totalRaw,
        uis_analytics_rollups_hourly: totalHourly,
        uis_analytics_rollups_daily: totalDaily
    });

    await mongoose.disconnect();
    console.log('\n[minimal-seed] done');
}

main().catch(async (err) => {
    console.error('[minimal-seed] fatal:', err);
    try {
        await mongoose.disconnect();
    } catch (_) { /* ignore */ }
    process.exit(1);
});
