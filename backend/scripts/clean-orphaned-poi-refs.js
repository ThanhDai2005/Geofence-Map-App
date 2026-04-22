/**
 * Clean Orphaned POI References in Intelligence Events
 *
 * This script removes events that reference POIs that no longer exist
 * or POIs that were outside Vietnam (now deleted).
 */

const fs = require('fs');
const path = require('path');

function cleanOrphanedPOIReferences() {
    console.log('🧹 Cleaning Orphaned POI References in Events...\n');

    // Load current valid POIs
    const poisPath = path.join(__dirname, '../mongo/vngo_travel.pois.json');
    const pois = JSON.parse(fs.readFileSync(poisPath, 'utf8'));

    const validPoiIds = new Set(pois.map(p => p._id?.$oid || String(p._id)));
    const validPoiCodes = new Set(pois.map(p => p.code).filter(Boolean));

    console.log(`✅ Loaded ${pois.length} valid POIs`);
    console.log(`   Valid POI IDs: ${validPoiIds.size}`);
    console.log(`   Valid POI Codes: ${validPoiCodes.size}\n`);

    // Clean events
    const eventsPath = path.join(__dirname, '../mongo/vngo_travel.uis_events_raw.json');
    const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));

    console.log(`📊 Total events: ${events.length}`);

    const removed = [];
    const cleaned = events.filter(event => {
        // Check for POI references in payload
        const payload = event.payload || {};
        const poiId = payload.poi_id || payload.poiId;
        const poiCode = payload.poi_code || payload.poiCode;

        // If event has POI reference, validate it
        if (poiId) {
            const poiIdStr = poiId.$oid || String(poiId);
            if (!validPoiIds.has(poiIdStr)) {
                removed.push({
                    id: event._id?.$oid,
                    device_id: event.device_id,
                    poi_id: poiIdStr,
                    reason: 'POI ID not found'
                });
                return false;
            }
        }

        if (poiCode && !validPoiIds.has(poiCode) && !validPoiCodes.has(poiCode)) {
            removed.push({
                id: event._id?.$oid,
                device_id: event.device_id,
                poi_code: poiCode,
                reason: 'POI code not found'
            });
            return false;
        }

        return true;
    });

    console.log(`❌ Removed events with orphaned POI refs: ${removed.length}`);
    console.log(`✅ Remaining events: ${cleaned.length}`);

    if (removed.length > 0) {
        console.log(`\n🗑️  Removed events (first 20):`);
        removed.slice(0, 20).forEach((r, i) => {
            console.log(`  ${i + 1}. Device: ${r.device_id} | ${r.reason} | POI: ${r.poi_id || r.poi_code}`);
        });

        fs.writeFileSync(eventsPath, JSON.stringify(cleaned, null, 2), 'utf8');
        console.log(`\n✅ Events file updated`);
    } else {
        console.log(`\n✅ No orphaned POI references found`);
    }

    // Also check if there's a poi-hourly-stats collection
    const statsPath = path.join(__dirname, '../mongo/vngo_travel.poi_hourly_stats.json');
    if (fs.existsSync(statsPath)) {
        console.log(`\n📂 Checking poi-hourly-stats...`);
        const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));

        const removedStats = [];
        const cleanedStats = stats.filter(stat => {
            const poiId = stat.poi_id?.$oid || String(stat.poi_id);
            if (!validPoiIds.has(poiId)) {
                removedStats.push({ poi_id: poiId });
                return false;
            }
            return true;
        });

        console.log(`📊 Original stats: ${stats.length}`);
        console.log(`❌ Removed stats: ${removedStats.length}`);
        console.log(`✅ Remaining stats: ${cleanedStats.length}`);

        if (removedStats.length > 0) {
            fs.writeFileSync(statsPath, JSON.stringify(cleanedStats, null, 2), 'utf8');
            console.log(`✅ Stats file updated`);
        }
    }

    console.log('\n🎉 Cleanup complete!');
}

try {
    cleanOrphanedPOIReferences();
} catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
}
