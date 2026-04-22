# Heatmap System Full Audit Report
**Date:** 2026-04-22  
**Status:** 🔴 CRITICAL BUG IDENTIFIED  
**Audit Type:** Full Data Pipeline Forensic Analysis

---

## Executive Summary

**ROOT CAUSE IDENTIFIED:** GeofenceService does NOT emit POI-linked telemetry events when a device enters a POI geofence. The `ObservingGeofenceService` emits a `GeofenceEvaluated` event with GPS coordinates but **NO POI ID**, causing the backend ingestion pipeline to reject the event per the "ALL heatmap events MUST be LINKED to a VALID POI ID" policy.

**Impact:** 1 device entering a POI = 0 heatmap data = NO COLOR on owner heatmap (level 0 instead of level 1).

**Severity:** CRITICAL — Heatmap system is completely non-functional for geofence-based POI entry.

---

## System Overview

The heatmap system tracks POI visitor activity through a multi-layer telemetry pipeline:

1. **Device Layer (MAUI Client)** — Detects POI entry via GPS geofencing
2. **ROEL Layer (Runtime Observability Event Layer)** — Captures raw telemetry events
3. **RBEL Layer (Runtime to Business Event Bridge)** — Maps ROEL events to wire contract
4. **Backend Ingestion Layer** — Validates events and writes to MongoDB
5. **Aggregation Layer** — Rolls up raw events into PoiHourlyStats
6. **API Layer** — Serves heatmap data to admin/owner dashboards
7. **UI Layer** — Renders heatmap with color-coded activity levels

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ DEVICE LAYER (MAUI Client)                                          │
├─────────────────────────────────────────────────────────────────────┤
│ GeofenceArbitrationKernel.PublishLocationAsync()                    │
│   ↓                                                                  │
│ ObservingGeofenceService.CheckLocationAsync()                       │
│   ├─ Emits: RuntimeTelemetryEvent(GeofenceEvaluated)               │
│   │   ✅ Has: latitude, longitude                                   │
│   │   ❌ MISSING: poiCode, poiId                                    │
│   ↓                                                                  │
│ GeofenceService.CheckLocationAsync()                                │
│   ├─ Detects POI entry (distance check)                            │
│   ├─ Triggers audio narration                                       │
│   └─ ❌ DOES NOT emit any telemetry with POI linkage               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ ROEL LAYER (Runtime Observability)                                  │
├─────────────────────────────────────────────────────────────────────┤
│ RuntimeTelemetryService.TryEnqueue()                                │
│   ├─ Batches events in memory                                       │
│   └─ Writes to debug NDJSON file                                    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ RBEL LAYER (Event Bridge)                                           │
├─────────────────────────────────────────────────────────────────────┤
│ RbelMappingProfile.TryMapFromRoel()                                 │
│   ├─ Maps GeofenceEvaluated → ("location", "GAK")                  │
│   ├─ Creates RbelWireEvent with payload:                            │
│   │   {                                                              │
│   │     "roelKind": "GeofenceEvaluated",                            │
│   │     "producerId": null,                                          │
│   │     "latitude": 10.762622,                                       │
│   │     "longitude": 106.660172,                                     │
│   │     "poiCode": null,  ❌ MISSING                                │
│   │     "detail": null                                               │
│   │   }                                                              │
│   └─ ❌ NO poiId field in RbelWireEvent contract                   │
│                                                                      │
│ RbelHttpClient.PostBatchAsync()                                     │
│   └─ POST /api/v1/intelligence/events/batch                         │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND INGESTION LAYER (Node.js)                                   │
├─────────────────────────────────────────────────────────────────────┤
│ POST /api/v1/intelligence/events/batch                              │
│   ↓                                                                  │
│ intelligence.controller.js → postBatch()                            │
│   ↓                                                                  │
│ intelligence-events.service.js → ingestBatch()                      │
│   ├─ Validates event contract                                       │
│   ├─ Maps to IntelligenceEventRaw document                          │
│   ├─ Checks: doc.payload.poi_id exists?                             │
│   │   ❌ NO → Event has no POI linkage                              │
│   ├─ Checks: doc.event_family === 'LocationEvent'?                  │
│   │   ✅ YES (GeofenceEvaluated maps to LocationEvent)              │
│   ├─ REJECTION POLICY (Line 324-330):                               │
│   │   "Location events without POI are not allowed in this system   │
│   │    as per 'ALL heatmap events MUST be LINKED to a VALID POI ID'"│
│   │   ❌ REJECTED: accepted--, rejected++                           │
│   │   ❌ SKIPPED: No PoiHourlyStats update                          │
│   └─ Returns: { accepted: 0, rejected: 1, errors: [...] }          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                         ❌ PIPELINE STOPS HERE
                         No data reaches PoiHourlyStats
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ AGGREGATION LAYER (MongoDB)                                         │
├─────────────────────────────────────────────────────────────────────┤
│ PoiHourlyStats Collection                                           │
│   ├─ Schema: { poi_id, hour_bucket, unique_devices[], ... }        │
│   └─ ❌ NO RECORDS CREATED (event was rejected)                    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ API LAYER (Backend Routes)                                          │
├─────────────────────────────────────────────────────────────────────┤
│ GET /api/v1/owner/intelligence/heatmap?poi_id=X                     │
│   ↓                                                                  │
│ intelligence-heatmap.service.js → getOwnerHeatmap()                 │
│   ├─ Queries PoiHourlyStats by poi_id + userId                      │
│   └─ Returns: [] (empty array — no data)                            │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ UI LAYER (React Admin Dashboard)                                    │
├─────────────────────────────────────────────────────────────────────┤
│ OwnerSubmissionsPage.jsx                                            │
│   ├─ Fetches heatmap data for selected POI                          │
│   └─ Receives: [] (empty array)                                     │
│                                                                      │
│ Heatmap.jsx → cellColor(count)                                      │
│   ├─ count = 0 (no data)                                            │
│   ├─ Line 39: if (!count || count <= 0) return HEATMAP_COLORS.EMPTY│
│   └─ Result: NO COLOR (white/gray cell)                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Layer-by-Layer Audit

### Layer 1: Device Geofence Detection

**File:** `Services/GeofenceService.cs`

**Current Behavior:**
```csharp
public async Task CheckLocationAsync(Location location, CancellationToken cancellationToken = default)
{
    // Lines 102-107: Distance calculation and POI matching
    var candidates = poisSnapshot
        .Select(p => new { Poi = p, Distance = DistanceInMeters(...) })
        .Where(x => x.Distance <= x.Poi.Radius)
        .OrderByDescending(x => x.Poi.Priority)
        .ThenBy(x => x.Distance)
        .ToList();
    
    // Lines 126-189: POI entry detection and audio trigger
    var best = candidates.First();
    var poi = best.Poi;
    
    // ❌ NO TELEMETRY EMISSION WITH POI LINKAGE
    
    // Line 189: Triggers audio narration
    await _audioService.SpeakAsync(poi.Code, text, _appState.CurrentLanguage, cancellationToken);
}
```

**Problem:** GeofenceService knows which POI was entered (has `poi.Code`, `poi.Id`) but does NOT emit any telemetry event linking the GPS coordinates to the POI.

---

### Layer 2: ROEL Observability Decorator

**File:** `Services/Observability/ObservingGeofenceService.cs`

**Current Behavior:**
```csharp
public async Task CheckLocationAsync(Location location, CancellationToken cancellationToken = default)
{
    // Lines 20-24: Emits GeofenceEvaluated event
    _telemetry.TryEnqueue(new RuntimeTelemetryEvent(
        RuntimeTelemetryEventKind.GeofenceEvaluated,
        DateTime.UtcNow.Ticks,
        latitude: location.Latitude,
        longitude: location.Longitude));
        // ❌ NO poiCode parameter
        // ❌ NO poiId parameter
    
    // Line 26: Forwards to inner GeofenceService
    await _inner.CheckLocationAsync(location, cancellationToken);
}
```

**Problem:** The decorator emits the event BEFORE the inner service determines which POI was entered. At this point, the POI is unknown, so `poiCode` is null.

---

### Layer 3: RBEL Mapping

**File:** `Services/RBEL/RbelMappingProfile.cs`

**Current Behavior:**
```csharp
// Line 80: GeofenceEvaluated maps to LocationEvent family
RuntimeTelemetryEventKind.GeofenceEvaluated => ("location", "GAK"),

// Lines 39-52: Payload construction
var payload = new Dictionary<string, object?>
{
    ["roelKind"] = evt.Kind.ToString(),
    ["producerId"] = evt.ProducerId,
    ["detail"] = evt.Detail,
    ["routeOrAction"] = evt.RouteOrAction,
    ["poiCode"] = evt.PoiCode  // ❌ NULL (not set by ObservingGeofenceService)
};

if (evt.Latitude is { } lat && evt.Longitude is { } lon)
{
    payload["latitude"] = lat;
    payload["longitude"] = lon;
}
```

**Problem:** The mapping correctly includes `poiCode` in the payload, but the source event has `poiCode = null`. The `RbelWireEvent` contract has NO `poiId` field at the top level.

---

### Layer 4: Backend Ingestion

**File:** `backend/src/services/intelligence-events.service.js`

**Current Behavior:**
```javascript
// Lines 97-123: Convert wire event to raw document
function toRawDoc(ev, family, ts, ingestionRequestId) {
    const payload = ev.payload && typeof ev.payload === 'object' ? { ...ev.payload } : {};
    
    // Lines 100-103: Extract poiId from wire event
    if (ev.poiId) {
        payload.poi_id = ev.poiId;
    }
    // ❌ ev.poiId does NOT exist in RbelWireEvent contract
    // ❌ payload.poi_id remains undefined
    
    const doc = {
        event_family: family,  // "LocationEvent"
        payload,  // { latitude, longitude, poiCode: null }
        // ...
    };
    return doc;
}

// Lines 323-330: POI validation for LocationEvent
if (doc.payload && doc.payload.poi_id) {
    const resolved = await resolvePoiAndFixGeo(doc);
    // ...
} else if (doc.event_family === 'LocationEvent') {
    // ❌ REJECTION: LocationEvent without poi_id
    accepted--;
    rejected++;
    errors.push({ 
        index: i, 
        code: 'MISSING_POI', 
        message: 'LocationEvent must include a valid poi_id for heatmap lineage.' 
    });
    continue;  // ❌ SKIP PoiHourlyStats update
}

// Lines 334-350: PoiHourlyStats rollup (NEVER REACHED)
if (doc.payload && doc.payload.poi_id) {
    const hourBucket = getHourBucket(doc.timestamp);
    const poiId = String(doc.payload.poi_id);
    
    await PoiHourlyStats.findOneAndUpdate(
        { poi_id: poiId, hour_bucket: hourBucket },
        {
            $addToSet: { unique_devices: doc.device_id },
            $set: { updated_at: new Date() }
        },
        { upsert: true, new: true }
    );
}
```

**Problem:** The backend correctly enforces the "LocationEvent must have poi_id" policy, but the client never sends `poi_id` in the wire event.

---

### Layer 5: Aggregation (PoiHourlyStats)

**File:** `backend/src/models/poi-hourly-stats.model.js`

**Schema:**
```javascript
{
    poi_id: { type: String, required: true, index: true },
    hour_bucket: { type: Date, required: true, index: true },
    unique_devices: [{ type: String }],
    total_unique_visitors: { type: Number, default: 0 },
    updated_at: { type: Date, default: Date.now }
}
```

**Status:** ❌ NO RECORDS CREATED (ingestion rejects events before reaching this layer)

---

### Layer 6: API Layer

**File:** `backend/src/services/intelligence-heatmap.service.js`

**Current Behavior:**
```javascript
// Lines 61-93: getOwnerHeatmap()
async function getOwnerHeatmap(userId, { poi_id, start, end }) {
    const match = { poi_id: String(poi_id) };
    
    // Query PoiHourlyStats
    const rows = await PoiHourlyStats.aggregate([
        { $match: match },
        // ...
    ]);
    
    return rows;  // ❌ Returns [] (empty array — no data)
}
```

**Status:** ✅ API logic is correct, but returns empty data because PoiHourlyStats has no records.

---

### Layer 7: UI Rendering

**File:** `admin-web/src/pages/intelligence/Heatmap.jsx`

**Current Behavior:**
```javascript
// Lines 38-45: cellColor() function
function cellColor(count) {
  if (!count || count <= 0) return HEATMAP_COLORS.EMPTY;  // ❌ count = 0
  if (count < HEATMAP_THRESHOLDS.LEVEL_1) return HEATMAP_COLORS.EMPTY;
  if (count < HEATMAP_THRESHOLDS.LEVEL_2) return HEATMAP_COLORS.LEVEL_1;
  if (count < HEATMAP_THRESHOLDS.LEVEL_3) return HEATMAP_COLORS.LEVEL_2;
  if (count < HEATMAP_THRESHOLDS.LEVEL_4) return HEATMAP_COLORS.LEVEL_3;
  return HEATMAP_COLORS.LEVEL_4;
}
```

**Status:** ✅ Rendering logic is correct. With `count = 0`, it correctly returns `EMPTY` color (no color).

---

## Bug Reproduction

### Scenario
1. Owner creates new POI via admin dashboard
2. Device moves into POI geofence (fake GPS or real movement)
3. GeofenceService detects entry, triggers audio narration
4. ObservingGeofenceService emits `GeofenceEvaluated` event with GPS but no POI ID
5. RBEL maps event to `LocationEvent` family with `payload.poiCode = null`
6. Backend ingestion rejects event: "LocationEvent must include a valid poi_id"
7. No PoiHourlyStats record created
8. Owner refreshes heatmap page
9. API returns empty array
10. UI renders NO COLOR (level 0) instead of light green (level 1)

### Expected Behavior
- 1 device entering POI → 1 unique_devices entry in PoiHourlyStats
- Heatmap API returns `[{ date: "2026-04-22", hour: 13, total_unique_visitors: 1 }]`
- UI renders LEVEL_1 color (light green #9be9a8)

### Actual Behavior
- 1 device entering POI → Event rejected by backend
- Heatmap API returns `[]`
- UI renders NO COLOR (white/gray)

---

## Root Cause Analysis

### Primary Root Cause
**GeofenceService does NOT emit POI-linked telemetry when detecting POI entry.**

The service has all the information needed (poi.Code, poi.Id, location) but does not call `_telemetry.TryEnqueue()` with a POI-linked event.

### Secondary Root Cause
**ObservingGeofenceService emits GeofenceEvaluated BEFORE POI determination.**

The decorator pattern emits the event at the wrong point in the execution flow — before the inner service knows which POI was entered.

### Tertiary Root Cause
**RbelWireEvent contract has NO poiId field.**

The wire contract only includes `poiCode` in the payload (as a string), but the backend expects `poiId` (MongoDB ObjectId or POI code) at the payload level. The backend tries to read `ev.poiId` (line 101) which doesn't exist in the contract.

---

## Fix Plan

### Fix 1: Emit POI-Linked Telemetry in GeofenceService (CRITICAL)

**File:** `Services/GeofenceService.cs`  
**Location:** Line 177-189 (after POI entry decision, before audio trigger)

**Change:**
```csharp
// Trigger narration
_currentActivePoiId = poi.Id;
lock (_lastTriggeredAt)
{
    _lastTriggeredAt[poi.Id] = now;
}

// ✅ ADD: Emit POI-linked telemetry for heatmap
_telemetry?.TryEnqueue(new RuntimeTelemetryEvent(
    RuntimeTelemetryEventKind.GeofenceEvaluated,
    DateTime.UtcNow.Ticks,
    producerId: "geofence",
    latitude: location.Latitude,
    longitude: location.Longitude,
    poiCode: poi.Code,
    routeOrAction: "poi_entry",
    detail: $"entry;poi={poi.Code};dist={best.Distance:0.0}m"));

var text = !string.IsNullOrWhiteSpace(poi.Localization?.NarrationShort) 
    ? poi.Localization.NarrationShort 
    : (poi.Localization?.Name ?? "");
Debug.WriteLine($"[GEOFENCE] Triggering POI id={poi.Id} code={poi.Code} textLen={text?.Length ?? 0}");

await _audioService.SpeakAsync(poi.Code, text, _appState.CurrentLanguage, cancellationToken);
```

**Why:** This ensures the telemetry event is emitted AFTER the POI is determined, with the correct `poiCode` linkage.

---

### Fix 2: Add PoiId Field to RbelWireEvent Contract (REQUIRED)

**File:** `Services/RBEL/RbelWireEvent.cs`  
**Location:** Line 36 (after Payload property)

**Change:**
```csharp
[JsonPropertyName("payload")] public Dictionary<string, object?> Payload { get; set; } = new();

// ✅ ADD: Top-level poiId field for backend ingestion
[JsonPropertyName("poiId")] public string? PoiId { get; set; }
```

**File:** `Services/RBEL/RbelMappingProfile.cs`  
**Location:** Line 57-74 (RbelWireEvent construction)

**Change:**
```csharp
return new RbelWireEvent
{
    ContractVersion = "v2",
    EventId = Guid.NewGuid().ToString("N"),
    CorrelationId = correlationId,
    SessionId = sessionId,
    DeviceId = user.DeviceId,
    UserId = user.UserId,
    AuthState = auth,
    UserType = userTypeWire,
    SourceSystem = source,
    RbelEventFamily = family,
    RbelMappingVersion = MappingVersion,
    RuntimeTickUtcTicks = evt.UtcTicks,
    RuntimeSequence = runtimeSequence,
    Timestamp = ts,
    Payload = payload,
    PoiId = evt.PoiCode  // ✅ ADD: Map poiCode to top-level poiId
};
```

**Why:** The backend ingestion service expects `ev.poiId` at the top level (line 101 of intelligence-events.service.js). This ensures the POI linkage is preserved through the wire contract.

---

### Fix 3: Inject IRuntimeTelemetry into GeofenceService (DEPENDENCY)

**File:** `Services/GeofenceService.cs`  
**Location:** Line 11-31 (constructor)

**Change:**
```csharp
public class GeofenceService : IGeofenceService
{
    private readonly IAudioPlayerService _audioService;
    private readonly AppState _appState;
    private readonly IRuntimeTelemetry _telemetry;  // ✅ ADD
    private readonly SemaphoreSlim _gate = new(1, 1);
    private string? _currentActivePoiId;
    private readonly Dictionary<string, DateTime> _lastTriggeredAt = new();

    // ... constants ...

    public GeofenceService(
        IAudioPlayerService audioService, 
        AppState appState,
        IRuntimeTelemetry telemetry)  // ✅ ADD parameter
    {
        _audioService = audioService;
        _appState = appState;
        _telemetry = telemetry;  // ✅ ADD

        _appState.PoisChanged += (s, e) => ResetInternalTracking();
    }
    
    // ...
}
```

**Why:** GeofenceService needs access to the telemetry service to emit events.

---

### Fix 4: Remove ObservingGeofenceService Decorator (OPTIONAL CLEANUP)

**File:** `Services/Observability/ObservingGeofenceService.cs`  
**Action:** DELETE FILE (or mark as deprecated)

**Reason:** With Fix 1, GeofenceService now emits its own telemetry at the correct point in the flow. The decorator is redundant and emits events at the wrong time (before POI determination).

**Alternative:** Keep the decorator but remove the `TryEnqueue()` call, making it a pure pass-through for future extensibility.

---

### Fix 5: Update DI Registration (REQUIRED)

**File:** `MauiProgram.cs` (or wherever services are registered)  
**Location:** Service registration block

**Change:**
```csharp
// BEFORE:
services.AddSingleton<GeofenceService>();
services.AddSingleton<IGeofenceService>(sp => 
    new ObservingGeofenceService(
        sp.GetRequiredService<GeofenceService>(),
        sp.GetRequiredService<IRuntimeTelemetry>()));

// AFTER (Option A: Direct registration):
services.AddSingleton<IGeofenceService, GeofenceService>();

// AFTER (Option B: Keep decorator as pass-through):
services.AddSingleton<GeofenceService>();
services.AddSingleton<IGeofenceService>(sp => 
    new ObservingGeofenceService(
        sp.GetRequiredService<GeofenceService>(),
        sp.GetRequiredService<IRuntimeTelemetry>()));
// (But remove TryEnqueue() call from ObservingGeofenceService.CheckLocationAsync)
```

---

## Validation Plan

### Step 1: Verify Event Emission (Client-Side)
1. Apply Fix 1, 2, 3, 5
2. Run app with fake GPS
3. Move device into POI geofence
4. Check debug logs for:
   ```
   [GEOFENCE] Triggering POI id=... code=POI001 ...
   [ROEL] Enqueued GeofenceEvaluated with poiCode=POI001
   ```
5. Check RBEL batch payload in network logs:
   ```json
   {
     "schema": "event-contract-v2",
     "events": [{
       "rbelEventFamily": "location",
       "poiId": "POI001",
       "payload": {
         "poiCode": "POI001",
         "latitude": 10.762622,
         "longitude": 106.660172
       }
     }]
   }
   ```

### Step 2: Verify Backend Ingestion
1. Check backend logs for:
   ```
   [INGESTION] Accepted event: POI POI001 resolved to ObjectId(...)
   ```
2. Query MongoDB:
   ```javascript
   db.poi_hourly_stats.find({ poi_id: "POI001" })
   // Expected: { poi_id: "POI001", hour_bucket: ISODate("2026-04-22T13:00:00Z"), unique_devices: ["device123"], total_unique_visitors: 1 }
   ```

### Step 3: Verify API Response
1. Call owner heatmap API:
   ```
   GET /api/v1/owner/intelligence/heatmap?poi_id=POI001&start=2026-04-22&end=2026-04-22
   ```
2. Expected response:
   ```json
   [
     { "date": "2026-04-22", "hour": 13, "total_unique_visitors": 1 }
   ]
   ```

### Step 4: Verify UI Rendering
1. Open owner dashboard
2. Select POI001
3. Check heatmap cell for 2026-04-22 13:00
4. Expected: Light green color (#9be9a8) — LEVEL_1

---

## Alternative Solutions (NOT RECOMMENDED)

### Alternative 1: Relax Backend Validation
**Change:** Remove the "LocationEvent must have poi_id" rejection policy.

**Why NOT:** This would allow orphaned location events into the system, breaking the "ALL heatmap events MUST be LINKED to a VALID POI ID" data lineage guarantee. Heatmap data would become unreliable.

### Alternative 2: Infer POI from GPS Coordinates
**Change:** Backend performs reverse geofence lookup (GPS → POI) during ingestion.

**Why NOT:** 
- Requires backend to maintain a copy of all POI geofences (lat/lon/radius)
- Introduces race conditions (POI moved/deleted between client detection and backend ingestion)
- Violates single-source-of-truth principle (client already knows which POI was entered)
- Performance overhead (distance calculation for every event)

### Alternative 3: Emit Telemetry in AudioService
**Change:** AudioService emits POI-linked telemetry when playing narration.

**Why NOT:**
- AudioService is called for both geofence entry AND manual playback (button tap)
- Would double-count heatmap data (1 entry = 2 events)
- Violates separation of concerns (audio playback ≠ analytics tracking)

---

## Summary of Changes

| File | Change | Priority |
|------|--------|----------|
| `Services/GeofenceService.cs` | Add `_telemetry` field, inject in constructor, emit POI-linked event after entry detection | CRITICAL |
| `Services/RBEL/RbelWireEvent.cs` | Add `PoiId` property | REQUIRED |
| `Services/RBEL/RbelMappingProfile.cs` | Map `evt.PoiCode` to `PoiId` field | REQUIRED |
| `MauiProgram.cs` | Update DI registration | REQUIRED |
| `Services/Observability/ObservingGeofenceService.cs` | Delete or remove `TryEnqueue()` call | OPTIONAL |

---

## Conclusion

✅ **Root Cause:** GeofenceService does NOT emit POI-linked telemetry when detecting POI entry.  
✅ **Impact:** Heatmap system is completely non-functional for geofence-based POI entry.  
✅ **Fix:** Emit `GeofenceEvaluated` event with `poiCode` AFTER POI determination, add `poiId` field to wire contract.  
✅ **Validation:** 1 device entering POI → 1 PoiHourlyStats record → level 1 heatmap color (light green).

**Next Steps:**
1. Apply Fix 1, 2, 3, 5 (critical path)
2. Test with fake GPS + real backend
3. Verify PoiHourlyStats record creation
4. Verify heatmap rendering shows level 1 color
5. Apply Fix 4 (cleanup) after validation

---

**Audit Completed By:** Claude (Senior System Auditor)  
**Audit Date:** 2026-04-22  
**Verification:** Full pipeline trace + code review + data flow analysis
