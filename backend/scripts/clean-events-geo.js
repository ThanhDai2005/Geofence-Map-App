/**
 * Clean Intelligence Events - Remove events with coordinates outside Vietnam
 *
 * This script scans all intelligence event collections and removes events
 * with geo_context coordinates outside Vietnam boundaries.
 */

const fs = require('fs');
const path = require('path');

// Vietnam geo boundaries (strict)
const VIETNAM_BOUNDS = {
    minLat: 8.0,
    maxLat: 23.5,
    minLng: 102.0,
    maxLng: 110.5
};

function isInVietnam(lat, lng) {
    if (lat == null || lng == null) return true; // Allow null (no geo data)
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (isNaN(lat) || isNaN(lng)) return false;
    if (lat === 0 && lng === 0) return false; // Fake coordinate

    return lat >= VIETNAM_BOUNDS.minLat &&
           lat <= VIETNAM_BOUNDS.maxLat &&
           lng >= VIETNAM_BOUNDS.minLng &&
           lng <= VIETNAM_BOUNDS.maxLng;
}

function cleanEventsFile(filename) {
    const filePath = path.join(__dirname, '../mongo', filename);

    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filename}`);
        return { original: 0, removed: 0, remaining: 0 };
    }

    console.log(`\n📂 Processing: ${filename}`);
    const rawData = fs.readFileSync(filePath, 'utf8');
    const events = JSON.parse(rawData);

    console.log(`📊 Total original events: ${events.length}`);

    const removed = [];
    const cleaned = events.filter(event => {
        // Check if event has geo_context
        const geoContext = event.geo_context || event.payload?.geo_context;

        if (!geoContext) {
            return true; // Keep events without geo data
        }

        // Extract coordinates
        let lat, lng;

        if (geoContext.lat != null && geoContext.lng != null) {
            lat = Number(geoContext.lat);
            lng = Number(geoContext.lng);
        } else if (geoContext.latitude != null && geoContext.longitude != null) {
            lat = Number(geoContext.latitude);
            lng = Number(geoContext.longitude);
        } else {
            return true; // No coordinates found, keep it
        }

        // Check if in Vietnam
        if (!isInVietnam(lat, lng)) {
            removed.push({
                id: event._id?.$oid || event._id,
                device_id: event.device_id,
                coords: [lat, lng],
                timestamp: event.timestamp?.$date || event.timestamp
            });
            return false;
        }

        return true;
    });

    console.log(`❌ Total removed: ${removed.length}`);
    console.log(`✅ Total remaining: ${cleaned.length}`);

    if (removed.length > 0) {
        console.log(`\n🗑️  Removed events (first 20):`);
        removed.slice(0, 20).forEach((r, i) => {
            console.log(`  ${i + 1}. Device: ${r.device_id} | Coords: [${r.coords[0]}, ${r.coords[1]}] | Time: ${r.timestamp}`);
        });

        // Write cleaned data
        console.log(`\n💾 Writing cleaned data...`);
        fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2), 'utf8');
        console.log(`✅ File updated: ${filename}`);
    } else {
        console.log(`✅ No events outside Vietnam found.`);
    }

    return {
        original: events.length,
        removed: removed.length,
        remaining: cleaned.length
    };
}

function cleanAllEventCollections() {
    console.log('🧹 Starting Intelligence Events Geo Cleaning...\n');
    console.log('📍 Vietnam Boundaries:');
    console.log(`   Latitude: ${VIETNAM_BOUNDS.minLat} → ${VIETNAM_BOUNDS.maxLat}`);
    console.log(`   Longitude: ${VIETNAM_BOUNDS.minLng} → ${VIETNAM_BOUNDS.maxLng}`);

    const files = [
        'vngo_travel.uis_events_raw.json',
        'vngo_travel.uis_analytics_rollups_daily.json',
        'vngo_travel.uis_analytics_rollups_hourly.json'
    ];

    let totalOriginal = 0;
    let totalRemoved = 0;
    let totalRemaining = 0;

    files.forEach(file => {
        const result = cleanEventsFile(file);
        totalOriginal += result.original;
        totalRemoved += result.removed;
        totalRemaining += result.remaining;
    });

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total original events: ${totalOriginal}`);
    console.log(`Total removed: ${totalRemoved}`);
    console.log(`Total remaining: ${totalRemaining}`);
    console.log('='.repeat(60));

    if (totalRemoved > 0) {
        console.log('\n✅ Cleaning complete! Events outside Vietnam have been removed.');
    } else {
        console.log('\n✅ All events are already within Vietnam boundaries!');
    }
}

// Run
try {
    cleanAllEventCollections();
} catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
}
