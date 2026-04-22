const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const IntelligenceEventRaw = require('../src/models/intelligence-event-raw.model');
const Poi = require('../src/models/poi.model');
const PoiHourlyStats = require('../src/models/poi-hourly-stats.model');
const config = require('../src/config');

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongodb.url);
    console.log('Connected.');

    // 1. Load all POIs for quick lookup
    const allPois = await Poi.find({}).lean();
    const poiById = new Map();
    const poiByCode = new Map();

    allPois.forEach(p => {
      poiById.set(String(p._id), p);
      if (p.code) {
        poiByCode.set(p.code.toUpperCase(), p);
      }
    });

    console.log(`Loaded ${allPois.length} POIs into memory.`);

    // 2. Fix IntelligenceEventRaw
    const totalRaw = await IntelligenceEventRaw.countDocuments({});
    console.log(`Found ${totalRaw} raw events to audit.`);

    let processed = 0;
    let fixed = 0;
    let deleted = 0;

    const cursor = IntelligenceEventRaw.find({}).cursor();

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      processed++;
      if (processed % 1000 === 0) console.log(`Processed ${processed}/${totalRaw}...`);

      const payload = doc.payload || {};
      const poiKey = payload.poi_id || payload.poi_code || payload.PoiCode; // Support legacy client labels

      if (!poiKey) {
        if (doc.event_family === 'LocationEvent') {
            await IntelligenceEventRaw.deleteOne({ _id: doc._id });
            deleted++;
        }
        continue;
      }

      // Try lookup
      const poi = poiById.get(String(poiKey)) || poiByCode.get(String(poiKey).toUpperCase());

      if (!poi) {
        // No matching POI in the truth dataset? ❌ REMOVE (Strict Lineage)
        await IntelligenceEventRaw.deleteOne({ _id: doc._id });
        deleted++;
        continue;
      }

      // Found POI. Update coordinates and normalize IDs.
      const lng = poi.location.coordinates[0];
      const lat = poi.location.coordinates[1];

      const needsUpdate = 
        payload.poi_id !== String(poi._id) ||
        payload.latitude !== lat ||
        payload.longitude !== lng;

      if (needsUpdate) {
        await IntelligenceEventRaw.updateOne(
          { _id: doc._id },
          {
            $set: {
              'payload.poi_id': String(poi._id),
              'payload.poi_code': poi.code,
              'payload.latitude': lat,
              'payload.longitude': lng,
              // Cleanup legacy fields
              'payload.PoiCode': undefined
            }
          }
        );
        fixed++;
      }
    }

    console.log(`Migration Step 1 (Raw Events) Complete.`);
    console.log(`- Total Processed: ${processed}`);
    console.log(`- Total Fixed: ${fixed}`);
    console.log(`- Total Deleted (Invalid POI): ${deleted}`);

    // 3. Fix PoiHourlyStats (ensure poi_id is normalized to ObjectId string)
    console.log('Auditing PoiHourlyStats...');
    const statsTotal = await PoiHourlyStats.countDocuments({});
    const statsCursor = PoiHourlyStats.find({}).cursor();
    
    let statsFixed = 0;
    let statsDeleted = 0;

    for (let stat = await statsCursor.next(); stat != null; stat = await statsCursor.next()) {
        const poi = poiById.get(stat.poi_id) || poiByCode.get(String(stat.poi_id).toUpperCase());
        
        if (!poi) {
            await PoiHourlyStats.deleteOne({ _id: stat._id });
            statsDeleted++;
            continue;
        }

        if (stat.poi_id !== String(poi._id)) {
            // Check if a merge is needed (if two records exist for same hour: one with ID, one with Code)
            const hourBucket = stat.hour_bucket;
            const targetId = String(poi._id);

            const existing = await PoiHourlyStats.findOne({ poi_id: targetId, hour_bucket: hourBucket });
            if (existing) {
                // Merge devices
                await PoiHourlyStats.updateOne(
                    { _id: existing._id },
                    { 
                        $addToSet: { unique_devices: { $each: stat.unique_devices || [] } },
                        $set: { updated_at: new Date() }
                    }
                );
                await PoiHourlyStats.deleteOne({ _id: stat._id });
            } else {
                // Just rename
                await PoiHourlyStats.updateOne({ _id: stat._id }, { $set: { poi_id: targetId } });
            }
            statsFixed++;
        }
    }

    console.log(`Migration Step 2 (Hourly Stats) Complete.`);
    console.log(`- Total Fixed/Merged: ${statsFixed}`);
    console.log(`- Total Deleted: ${statsDeleted}`);

    console.log('ALL TASKS COMPLETED SUCCESSFULLY.');
    process.exit(0);

  } catch (err) {
    console.error('CRITICAL MIGRATION FAILURE:', err);
    process.exit(1);
  }
}

migrate();
