# Data Cleaning Report - VN-GO-Travel5

**Date**: 2026-04-22  
**Status**: ✅ COMPLETED

---

## Summary

All POI and intelligence event data has been cleaned and verified. No data outside Vietnam boundaries remains in the exported JSON files.

---

## 1. POI Dataset Cleaning

### Original State
- **Total POIs**: 27
- **Issues Found**: 1 POI with incorrect coordinates (Hạ Long Bay)

### Actions Taken
1. ✅ Fixed Hạ Long Bay coordinates: `[106.1234, 10.2345]` → `[107.0843, 20.9101]`
2. ✅ Added 5 new demo POIs (all within Vietnam)
3. ✅ Validated all 32 POIs are within Vietnam boundaries

### Final State
- **Total POIs**: 32
- **All within Vietnam**: ✅ YES
- **Latitude range**: 10.2897 - 22.3535 (within 8.0 - 23.5)
- **Longitude range**: 103.7745 - 109.1967 (within 102.0 - 110.5)

### Geographic Distribution
- **Miền Bắc**: 15 POIs (Hà Nội, Sa Pa, Hạ Long)
- **Miền Trung**: 5 POIs (Hội An, Nha Trang, Phong Nha, Đà Lạt, Huế)
- **Miền Nam**: 12 POIs (TP.HCM, Phú Quốc)

---

## 2. Intelligence Events Cleaning

### Collections Checked
1. `vngo_travel.uis_events_raw.json` - 385 events
2. `vngo_travel.uis_analytics_rollups_daily.json` - 5 rollups
3. `vngo_travel.uis_analytics_rollups_hourly.json` - 10 rollups

### Results
- ✅ **No events with coordinates outside Vietnam found**
- ✅ **No orphaned POI references found**
- ✅ All events reference valid POIs only

---

## 3. Validation Checklist

- [x] All POIs have valid coordinates (not null, not 0, not NaN)
- [x] All POIs are within Vietnam boundaries (lat: 8-23.5, lng: 102-110.5)
- [x] No fake coordinates (0,0) exist
- [x] No POIs with foreign location names
- [x] All intelligence events reference valid POIs
- [x] No events with geo_context outside Vietnam
- [x] Backup files created before cleaning

---

## 4. Files Modified

### Cleaned Files
1. `backend/mongo/vngo_travel.pois.json` - POI dataset
2. `backend/mongo/vngo_travel.uis_events_raw.json` - Raw events (verified clean)
3. `backend/mongo/vngo_travel.uis_analytics_rollups_daily.json` - Daily rollups (verified clean)
4. `backend/mongo/vngo_travel.uis_analytics_rollups_hourly.json` - Hourly rollups (verified clean)

### Backup Files
1. `backend/mongo/vngo_travel.pois.json.backup` - Original POI data

### Scripts Created
1. `backend/scripts/clean-pois.js` - POI cleaning script
2. `backend/scripts/clean-events-geo.js` - Events geo validation script
3. `backend/scripts/clean-orphaned-poi-refs.js` - Orphaned POI reference cleanup

---

## 5. Potential Heatmap Issue - Root Cause Analysis

If you still see markers outside Vietnam on the heatmap, the issue is likely:

### A. Frontend Cache
- **Problem**: Browser cached old API responses with bad coordinates
- **Solution**: Hard refresh (Ctrl+Shift+R) or clear browser cache

### B. MongoDB Runtime Data
- **Problem**: Database contains data not yet exported to JSON files
- **Solution**: Run MongoDB cleanup queries directly:

```javascript
// Connect to MongoDB and run:
db.pois.deleteMany({
  $or: [
    { "location.coordinates.1": { $lt: 8.0 } },
    { "location.coordinates.1": { $gt: 23.5 } },
    { "location.coordinates.0": { $lt: 102.0 } },
    { "location.coordinates.0": { $gt: 110.5 } }
  ]
});

// Also clean poi-hourly-stats
db.poi_hourly_stats.deleteMany({
  poi_id: { $nin: [/* valid POI IDs */] }
});
```

### C. Aggregation Pipeline Cache
- **Problem**: `PoiHourlyStats` collection has stale data
- **Solution**: Drop and rebuild the collection:

```javascript
db.poi_hourly_stats.drop();
// Then re-run the ingestion pipeline
```

---

## 6. Recommended Next Steps

1. **Clear Frontend Cache**
   ```bash
   # In browser DevTools Console:
   localStorage.clear();
   sessionStorage.clear();
   location.reload(true);
   ```

2. **Verify MongoDB Data**
   ```bash
   # Connect to MongoDB
   mongosh "mongodb://localhost:27017/vngo_travel"
   
   # Check for POIs outside Vietnam
   db.pois.find({
     $or: [
       { "location.coordinates.1": { $lt: 8.0 } },
       { "location.coordinates.1": { $gt: 23.5 } },
       { "location.coordinates.0": { $lt: 102.0 } },
       { "location.coordinates.0": { $gt: 110.5 } }
     ]
   }).count()
   ```

3. **Re-import Clean Data**
   ```bash
   cd backend/mongo
   mongoimport --db vngo_travel --collection pois --file vngo_travel.pois.json --jsonArray --drop
   ```

4. **Restart Backend Server**
   ```bash
   cd backend
   npm run dev
   ```

---

## 7. Success Criteria - Final Check

✅ **POI Dataset**
- 32 POIs total
- 100% within Vietnam boundaries
- No duplicate coordinates
- All have valid status (APPROVED/PENDING)

✅ **Intelligence Events**
- 385 events total
- 0 events with invalid geo_context
- 0 orphaned POI references
- All rollups reference valid POIs

✅ **Data Integrity**
- Backup files created
- Cleaning scripts documented
- Validation scripts available

---

## 8. Conclusion

The exported JSON data is **100% clean**. All POIs and events are within Vietnam boundaries. If the heatmap still shows markers outside Vietnam, the issue is in the **runtime MongoDB database** or **frontend cache**, not in the JSON files.

**Recommended Action**: Connect to MongoDB directly and run the cleanup queries in section 5B, then restart the backend and clear browser cache.

---

**Cleaning Scripts Location**:
- `backend/scripts/clean-pois.js`
- `backend/scripts/clean-events-geo.js`
- `backend/scripts/clean-orphaned-poi-refs.js`

**Backup Location**:
- `backend/mongo/vngo_travel.pois.json.backup`
