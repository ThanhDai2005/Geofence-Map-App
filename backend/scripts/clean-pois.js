/**
 * POI Data Cleaning Script
 *
 * Removes POIs outside Vietnam boundaries and adds sample data for demo
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

function isValidCoordinate(lat, lng) {
    if (lat == null || lng == null) return false;
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (isNaN(lat) || isNaN(lng)) return false;
    if (lat === 0 && lng === 0) return false;
    return true;
}

function isInVietnam(lat, lng) {
    return lat >= VIETNAM_BOUNDS.minLat &&
           lat <= VIETNAM_BOUNDS.maxLat &&
           lng >= VIETNAM_BOUNDS.minLng &&
           lng <= VIETNAM_BOUNDS.maxLng;
}

function cleanPOIs() {
    const filePath = path.join(__dirname, '../mongo/vngo_travel.pois.json');

    console.log('📂 Reading POI file...');
    const rawData = fs.readFileSync(filePath, 'utf8');
    const pois = JSON.parse(rawData);

    console.log(`📊 Total original POIs: ${pois.length}`);

    const removed = [];
    const cleaned = pois.filter(poi => {
        // Extract coordinates
        const coords = poi.location?.coordinates;
        if (!coords || !Array.isArray(coords) || coords.length !== 2) {
            removed.push({ id: poi._id?.$oid, code: poi.code, reason: 'Invalid coordinates structure' });
            return false;
        }

        const [lng, lat] = coords;

        // Validate coordinates
        if (!isValidCoordinate(lat, lng)) {
            removed.push({ id: poi._id?.$oid, code: poi.code, reason: 'Invalid coordinate values' });
            return false;
        }

        // Check if in Vietnam
        if (!isInVietnam(lat, lng)) {
            removed.push({ id: poi._id?.$oid, code: poi.code, reason: `Out of bounds: [${lat}, ${lng}]` });
            return false;
        }

        return true;
    });

    // Fix Hạ Long Bay coordinates (currently wrong)
    const haLongPoi = cleaned.find(p => p.code === 'ha-long');
    if (haLongPoi) {
        console.log('🔧 Fixing Hạ Long Bay coordinates...');
        haLongPoi.location.coordinates = [107.0843, 20.9101]; // Correct Hạ Long Bay coords
        haLongPoi.name = 'Vịnh Hạ Long';
        haLongPoi.summary = 'Di sản thiên nhiên thế giới UNESCO';
        haLongPoi.narrationShort = 'Bạn đang đến gần Vịnh Hạ Long, một trong những kỳ quan thiên nhiên của thế giới.';
        haLongPoi.narrationLong = 'Vịnh Hạ Long là di sản thiên nhiên thế giới được UNESCO công nhận, nổi tiếng với hàng nghìn hòn đảo đá vôi nhô lên từ mặt nước xanh biếc. Đây là điểm đến không thể bỏ qua khi du lịch Việt Nam.';
        haLongPoi.radius = 500;
        haLongPoi.priority = 5;
    }

    // Add more sample POIs for demo
    const newPOIs = [
        {
            "_id": { "$oid": "69e5be8e59c3cf3141c27bc7" },
            "code": "HOI_AN",
            "location": {
                "type": "Point",
                "coordinates": [108.3380, 15.8801]
            },
            "radius": 200,
            "priority": 5,
            "languageCode": "vi",
            "name": "Phố cổ Hội An",
            "summary": "Di sản văn hóa thế giới UNESCO",
            "narrationShort": "Bạn đang đến phố cổ Hội An, một trong những di sản văn hóa đẹp nhất Việt Nam.",
            "narrationLong": "Phố cổ Hội An là di sản văn hóa thế giới được UNESCO công nhận, nổi tiếng với kiến trúc cổ kính, đèn lồng rực rỡ và không khí yên bình. Đây là nơi giao thoa văn hóa Đông Tây độc đáo.",
            "isPremiumOnly": false,
            "status": "APPROVED",
            "submittedBy": null,
            "rejectionReason": null
        },
        {
            "_id": { "$oid": "69e5be8e59c3cf3141c27bc8" },
            "code": "PHU_QUOC",
            "location": {
                "type": "Point",
                "coordinates": [103.9650, 10.2897]
            },
            "radius": 300,
            "priority": 4,
            "languageCode": "vi",
            "name": "Đảo Phú Quốc",
            "summary": "Đảo ngọc của Việt Nam",
            "narrationShort": "Bạn đang ở Phú Quốc, hòn đảo xinh đẹp nhất Việt Nam.",
            "narrationLong": "Phú Quốc được mệnh danh là đảo ngọc với bãi biển trắng mịn, nước biển trong xanh và hệ sinh thái phong phú. Đây là điểm đến nghỉ dưỡng lý tưởng cho du khách trong và ngoài nước.",
            "isPremiumOnly": false,
            "status": "APPROVED",
            "submittedBy": null,
            "rejectionReason": null
        },
        {
            "_id": { "$oid": "69e5be8e59c3cf3141c27bc9" },
            "code": "DA_LAT",
            "location": {
                "type": "Point",
                "coordinates": [108.4419, 11.9404]
            },
            "radius": 250,
            "priority": 4,
            "languageCode": "vi",
            "name": "Thành phố Đà Lạt",
            "summary": "Thành phố ngàn hoa",
            "narrationShort": "Bạn đang đến Đà Lạt, thành phố của sương mù và hoa.",
            "narrationLong": "Đà Lạt là thành phố cao nguyên nổi tiếng với khí hậu mát mẻ quanh năm, những đồi thông xanh mướt và vườn hoa rực rỡ. Đây là điểm đến lãng mạn và thơ mộng nhất Việt Nam.",
            "isPremiumOnly": false,
            "status": "APPROVED",
            "submittedBy": null,
            "rejectionReason": null
        },
        {
            "_id": { "$oid": "69e5be8e59c3cf3141c27bca" },
            "code": "NHA_TRANG",
            "location": {
                "type": "Point",
                "coordinates": [109.1967, 12.2388]
            },
            "radius": 200,
            "priority": 4,
            "languageCode": "vi",
            "name": "Bãi biển Nha Trang",
            "summary": "Vịnh biển đẹp nhất Việt Nam",
            "narrationShort": "Bạn đang ở Nha Trang, thành phố biển sôi động của Việt Nam.",
            "narrationLong": "Nha Trang nổi tiếng với bãi biển dài, nước biển trong xanh và các hoạt động thể thao nước phong phú. Đây là điểm đến yêu thích của du khách muốn tận hưởng biển cả và ánh nắng.",
            "isPremiumOnly": false,
            "status": "APPROVED",
            "submittedBy": null,
            "rejectionReason": null
        },
        {
            "_id": { "$oid": "69e5be8e59c3cf3141c27bcb" },
            "code": "PHONG_NHA",
            "location": {
                "type": "Point",
                "coordinates": [106.2843, 17.5826]
            },
            "radius": 300,
            "priority": 3,
            "languageCode": "vi",
            "name": "Vườn quốc gia Phong Nha - Kẻ Bàng",
            "summary": "Hệ thống hang động lớn nhất thế giới",
            "narrationShort": "Bạn đang đến Phong Nha - Kẻ Bàng, nơi có hang Sơn Đoòng lớn nhất thế giới.",
            "narrationLong": "Phong Nha - Kẻ Bàng là di sản thiên nhiên thế giới với hệ thống hang động kỳ vĩ, trong đó có hang Sơn Đoòng - hang động lớn nhất thế giới. Đây là thiên đường cho những ai yêu thích khám phá thiên nhiên hoang sơ.",
            "isPremiumOnly": true,
            "status": "APPROVED",
            "submittedBy": null,
            "rejectionReason": null
        }
    ];

    // Add new POIs
    cleaned.push(...newPOIs);

    console.log(`\n✅ Cleaning complete!`);
    console.log(`📊 Total original: ${pois.length}`);
    console.log(`❌ Total removed: ${removed.length}`);
    console.log(`➕ Total added: ${newPOIs.length}`);
    console.log(`✅ Total remaining: ${cleaned.length}`);

    if (removed.length > 0) {
        console.log(`\n🗑️  Removed POIs (first 50):`);
        removed.slice(0, 50).forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.code || 'N/A'} (${r.id || 'N/A'}) - ${r.reason}`);
        });
    }

    // Write cleaned data
    console.log(`\n💾 Writing cleaned data...`);
    fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2), 'utf8');
    console.log(`✅ File updated: ${filePath}`);

    // Validation
    console.log(`\n🔍 Validating cleaned data...`);
    let allValid = true;
    cleaned.forEach(poi => {
        const [lng, lat] = poi.location.coordinates;
        if (!isInVietnam(lat, lng)) {
            console.log(`❌ Invalid POI found: ${poi.code} [${lat}, ${lng}]`);
            allValid = false;
        }
    });

    if (allValid) {
        console.log(`✅ All POIs are within Vietnam boundaries!`);
    }

    console.log(`\n🎉 Data cleaning complete!`);
}

// Run
try {
    cleanPOIs();
} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
