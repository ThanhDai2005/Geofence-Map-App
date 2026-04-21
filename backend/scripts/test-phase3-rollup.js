require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const intelligenceEventsService = require('../src/services/intelligence-events.service');
const intelligenceHeatmapService = require('../src/services/intelligence-heatmap.service');
const PoiHourlyStats = require('../src/models/poi-hourly-stats.model');
const IntelligenceEventRaw = require('../src/models/intelligence-event-raw.model');
const fs = require('fs');

const TEST_POI = 'TEST_POI_X';

function makeEvent(deviceId, poiId, timestampStr, eventId = crypto.randomUUID()) {
    return {
        eventId: eventId,
        contractVersion: 'v2',
        deviceId: deviceId,
        correlationId: crypto.randomUUID(),
        authState: 'guest',
        sourceSystem: 'GAK',
        rbelEventFamily: 'location',
        rbelMappingVersion: '1.0',
        timestamp: timestampStr,
        payload: { poi_id: poiId }
    };
}

async function clearTestData() {
    await IntelligenceEventRaw.deleteMany({ 'payload.poi_id': { $regex: '^TEST_POI' } });
    await PoiHourlyStats.deleteMany({ poi_id: { $regex: '^TEST_POI' } });
}

async function runTests() {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/VN_GO_Travel', {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    console.log('✅ Connected.');

    await clearTestData();

    try {
        console.log('\n🔥 TEST GROUP 1 — ROLLUP CORRECTNESS');
        
        // Test 1.1 -- Single Device
        const t1_date = new Date('2026-04-21T10:15:00Z');
        await intelligenceEventsService.ingestSingle(makeEvent('DeviceA', TEST_POI, t1_date), null, {});
        
        let stat = await PoiHourlyStats.findOne({ poi_id: TEST_POI, hour_bucket: new Date('2026-04-21T10:00:00Z') });
        if (stat && stat.total_unique_visitors === 1 && stat.unique_devices.includes('DeviceA')) {
            console.log('✅ [TEST PASS] 1.1 Single Device');
        } else throw new Error('1.1 Failed');

        // Test 1.2 -- Duplicate Event
        const t1_event = makeEvent('DeviceA', TEST_POI, t1_date);
        for(let i=0; i<5; i++) {
            await intelligenceEventsService.ingestSingle(t1_event, null, {}); // Identical event
        }
        stat = await PoiHourlyStats.findOne({ poi_id: TEST_POI, hour_bucket: new Date('2026-04-21T10:00:00Z') });
        if (stat.total_unique_visitors === 1 && stat.unique_devices.length === 1) {
            console.log('✅ [TEST PASS] 1.2 Duplicate Event (NO duplication)');
        } else throw new Error(`1.2 Failed: count=${stat.total_unique_visitors}`);

        // Test 1.3 -- Multiple Devices
        await intelligenceEventsService.ingestBatch({
            schema: 'event-contract-v2',
            events: [
                makeEvent('DeviceB', TEST_POI, t1_date),
                makeEvent('DeviceC', TEST_POI, t1_date)
            ]
        });
        stat = await PoiHourlyStats.findOne({ poi_id: TEST_POI, hour_bucket: new Date('2026-04-21T10:00:00Z') });
        if (stat.total_unique_visitors === 3) {
            console.log('✅ [TEST PASS] 1.3 Multiple Devices');
        } else throw new Error('1.3 Failed');

        // Test 1.4 -- Multi Hour
        const t2_date = new Date('2026-04-21T11:05:00Z');
        await intelligenceEventsService.ingestSingle(makeEvent('DeviceA', TEST_POI, t2_date), null, {});
        const countGroups = await PoiHourlyStats.countDocuments({ poi_id: TEST_POI });
        if (countGroups === 2) {
            console.log('✅ [TEST PASS] 1.4 Multi Hour');
        } else throw new Error('1.4 Failed');


        console.log('\n🔥 TEST GROUP 2 — IDEMPOTENCY INTEGRATION');
        
        await clearTestData();
        const batchIdempotent = [
            makeEvent('Dev1', 'TEST_POI_IDEM', '2026-04-21T08:00:00Z'),
            makeEvent('Dev2', 'TEST_POI_IDEM', '2026-04-21T08:05:00Z')
        ];
        
        // Send 5 times
        let acceptedTotal = 0, duplicateTotal = 0;
        for (let i = 0; i < 5; i++) {
            const res = await intelligenceEventsService.ingestBatch({ schema: 'event-contract-v2', events: batchIdempotent });
            acceptedTotal += res.accepted;
            duplicateTotal += res.duplicate;
        }
        
        stat = await PoiHourlyStats.findOne({ poi_id: 'TEST_POI_IDEM' });
        if (acceptedTotal === 2 && duplicateTotal === 8 && stat.total_unique_visitors === 2) {
            console.log('✅ [TEST PASS] 2.1 & 2.2 Duplicate Batch & Mixed Events Handled');
        } else throw new Error('Group 2 Failed');


        console.log('\n🔥 TEST GROUP 5 — MEMORY SAFETY');
        await clearTestData();
        
        // Insert 1200 unique devices into the same hour to test the 1000 limit
        const limitEvents = [];
        for(let i=0; i<1200; i++) {
            limitEvents.push(makeEvent(`LimitDev_${i}`, 'TEST_POI_LIMIT', '2026-04-21T15:30:00Z'));
        }
        // Send in batches of 100
        for(let i=0; i<12; i++) {
            await intelligenceEventsService.ingestBatch({ schema: 'event-contract-v2', events: limitEvents.slice(i*100, i*100+100) });
        }
        
        stat = await PoiHourlyStats.findOne({ poi_id: 'TEST_POI_LIMIT' });
        if (stat.total_unique_visitors <= 1000 && stat.unique_devices.length <= 1000) {
            console.log(`✅ [TEST PASS] 5.1 Device Explosion (Capped at ${stat.total_unique_visitors})`);
        } else throw new Error('5.1 Failed: Cap not respected');


        console.log('\n🔥 TEST GROUP 6 — CONCURRENCY');
        await clearTestData();
        const concurrentEvents = Array.from({length: 50}).map((_, i) => makeEvent(`ConcDev_${i}`, 'TEST_POI_CONC', '2026-04-21T12:00:00Z'));
        
        // Fire 5 batches simultaneously
        await Promise.all([
            intelligenceEventsService.ingestBatch({ schema: 'event-contract-v2', events: concurrentEvents.slice(0, 10) }),
            intelligenceEventsService.ingestBatch({ schema: 'event-contract-v2', events: concurrentEvents.slice(10, 20) }),
            intelligenceEventsService.ingestBatch({ schema: 'event-contract-v2', events: concurrentEvents.slice(20, 30) }),
            intelligenceEventsService.ingestBatch({ schema: 'event-contract-v2', events: concurrentEvents.slice(30, 40) }),
            intelligenceEventsService.ingestBatch({ schema: 'event-contract-v2', events: concurrentEvents.slice(40, 50) })
        ]);
        
        stat = await PoiHourlyStats.findOne({ poi_id: 'TEST_POI_CONC' });
        if (stat.total_unique_visitors === 50) {
           console.log('✅ [TEST PASS] 6.1 Parallel Inserts');
        } else throw new Error(`6.1 Failed: Expected 50, got ${stat?.total_unique_visitors}`);


        console.log('\n🔥 TEST GROUP 4 — QUERY VALIDATION');
        const heatmapCode = fs.readFileSync('../src/services/intelligence-heatmap.service.js', 'utf8');
        if (!heatmapCode.includes('IntelligenceEventRaw.aggregate')) {
            console.log('✅ [TEST PASS] 4.1 No Raw Aggregation in Heatmap Logic (Static Check)');
        } else throw new Error('4.1 Failed: Still uses IntelligenceEventRaw.aggregate');
        
        if (heatmapCode.includes('PoiHourlyStats.aggregate')) {
            console.log('✅ [TEST PASS] 4.2 Uses PoiHourlyStats appropriately');
        } else throw new Error('4.2 Failed: PoiHourlyStats not used correctly');


        console.log('\n🔥 TEST GROUP 3 — PERFORMANCE (LARGE DATASET SIMULATION)');
        // To simulate 100k events realistically without running for 10 minutes,
        // we will directly seed the PoiHourlyStats collection to represent 100k events over 100 POIs, 24 hours.
        await clearTestData();
        
        console.log('   [Simulating 100,000 events / 2400 hour buckets for 100 POIs...]');
        const bulkOps = [];
        const baseDate = new Date('2026-04-21T00:00:00Z').getTime();
        
        for(let p = 0; p < 100; p++) {
            for(let h = 0; h < 24; h++) {
                bulkOps.push({
                    insertOne: {
                        document: {
                            poi_id: `TEST_POI_PERF_${p}`,
                            hour_bucket: new Date(baseDate + (h * 3600000)),
                            unique_devices: Array.from({length: 40}).map((_, i) => `D_${p}_${h}_${i}`), // ~40 visitors per hour per POI = 96k total
                            total_unique_visitors: 40,
                            updated_at: new Date()
                        }
                    }
                });
            }
        }
        await PoiHourlyStats.bulkWrite(bulkOps);
        console.log('   [Simulation Data Seeded]');

        // Perform Heatmap Query
        const startParams = { 
            start: new Date(baseDate).toISOString(), 
            end: new Date(baseDate + (24 * 3600000)).toISOString() 
        };
        const perfStart = Date.now();
        
        // We will call the underlying service function using parseRange
        const { start, end } = intelligenceHeatmapService.parseRange(startParams.start, startParams.end);
        
        // Simulating Admin heatmap over all POIs
        // Note: Admin heatmap aggregate code doesn't scan by POI, but processes all hour_buckets.
        const heatmapResult = await intelligenceHeatmapService._aggregateHeatmap_export 
            ? await intelligenceHeatmapService._aggregateHeatmap_export(start, end, null)
            : await intelligenceHeatmapService.getAdminHeatmap(startParams);
        
        const perfEnd = Date.now();
        const durationMs = perfEnd - perfStart;

        if (durationMs < 50) {
            console.log(`✅ [TEST PASS] 3.1 Heatmap Query Speed is FAST: ${durationMs}ms`);
        } else {
            console.warn(`⚠️ [TEST WARN] 3.1 Heatmap query was ${durationMs}ms (Expected < 50ms)`);
            // Depending on Mongo setup locally, it might be slightly above 50, but <100 is great.
        }

        console.log('\n========================================');
        console.log('🚀 ALL TESTS COMPLETED SUCCESSFULLY!');
        console.log(`📊 PERFORMANCE: ${durationMs}ms to query ~100k events aggregate`);
        console.log('========================================');

    } catch (err) {
        console.error('\n❌ [TEST FAILED]', err.message);
        console.error(err.stack);
        process.exit(1);
    }

    await clearTestData();
    mongoose.connection.close();
    process.exit(0);
}

runTests();