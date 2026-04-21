const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Poi = require('../src/models/poi.model');
const PoiHourlyStats = require('../src/models/poi-hourly-stats.model');
const intelligenceMetricsService = require('../src/services/intelligence-metrics.service');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function runTests() {
    console.log('🚀 Starting Phase 6 Prediction Validation Tests...');
    
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vngo-travel');
        console.log('✅ Connected to MongoDB');

        // Cleanup test data
        await Poi.deleteMany({ code: { $regex: '^TEST_PREDICT_' } });
        await PoiHourlyStats.deleteMany({ poi_id: { $regex: '^TEST_PREDICT_' } });

        const testPois = [
            { code: 'TEST_PREDICT_INC', name: 'Increasing Trend POI', lat: 10.1, lng: 106.1, history: [10, 20, 30] },
            { code: 'TEST_PREDICT_STA', name: 'Stable POI', lat: 10.2, lng: 106.2, history: [10, 10, 10] },
            { code: 'TEST_PREDICT_SPI', name: 'Spike POI', lat: 10.3, lng: 106.3, history: [5, 5, 100] },
            { code: 'TEST_PREDICT_LOW', name: 'Low Data POI', lat: 10.4, lng: 106.4, history: [50] }
        ];

        for (const tp of testPois) {
            const poi = await Poi.create({
                code: tp.code,
                name: tp.name,
                location: { type: 'Point', coordinates: [tp.lng, tp.lat] },
                status: 'APPROVED'
            });

            // Create history buckets
            const now = new Date();
            for (let i = 0; i < tp.history.length; i++) {
                await PoiHourlyStats.create({
                    poi_id: poi._id,
                    hour_bucket: new Date(now.getTime() - (tp.history.length - i) * 3600000),
                    total_unique_visitors: tp.history[i]
                });
            }
        }

        console.log('📡 Fetching Geo Heatmap predictions...');
        const start = new Date(Date.now() - 24 * 3600000).toISOString();
        const end = new Date().toISOString();
        const results = await intelligenceMetricsService.getGeoHeatmap({ start, end });

        const validate = (code, expectedPredicted, expectedLevel) => {
            const res = results.find(r => r.code === code);
            if (!res) {
                console.error(`❌ [FAIL] ${code}: Not found in results`);
                return false;
            }
            const match = Math.abs(res.predicted - expectedPredicted) < 1;
            const levelMatch = res.level === expectedLevel;
            
            if (match && levelMatch) {
                console.log(`✅ [PASS] ${code}: Predicted=${res.predicted}, Level=${res.level}`);
                return true;
            } else {
                console.error(`❌ [FAIL] ${code}: Expected ~${expectedPredicted} (${expectedLevel}), Got ${res.predicted} (${res.level})`);
                return false;
            }
        };

        let allPass = true;
        allPass &= validate('TEST_PREDICT_INC', 20, 'MEDIUM'); // (10+20+30)/3 = 20 (>=10 and <30)
        allPass &= validate('TEST_PREDICT_STA', 10, 'MEDIUM'); // 10 (>=10 and <30)
        allPass &= validate('TEST_PREDICT_SPI', 36.6, 'HIGH'); // (5+5+100)/3 = 36.6 (>=30)
        allPass &= validate('TEST_PREDICT_LOW', 50, 'HIGH');   // Fallback to 50 (>=30)

        // Cleanup
        await Poi.deleteMany({ code: { $regex: '^TEST_PREDICT_' } });
        // Can't easily delete stats by poi_id if it's an ObjectId string here, but cleanup by regex in beginning is enough if we use same codes.
        
        if (allPass) {
            console.log('\n✨ ALL PHASE 6 VALIDATION TESTS PASSED!');
        } else {
            console.error('\n⚠️ SOME TESTS FAILED.');
        }

    } catch (err) {
        console.error('💥 Test Execution Error:', err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

runTests();
