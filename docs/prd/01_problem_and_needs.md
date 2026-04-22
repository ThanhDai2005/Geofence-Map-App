# Problem Statement and System Needs

**Document Version:** 1.0  
**Last Updated:** 2026-04-22  
**Status:** Production System Analysis

---

## 1. Problem Statement

### 1.1 Core Problem
International tourists visiting Vietnam face significant barriers when exploring Points of Interest (POIs):

1. **Language Barrier**: Most historical sites, museums, and cultural landmarks provide information only in Vietnamese or English, excluding tourists from China, Japan, Korea, and other non-English speaking countries.

2. **Information Accessibility**: Traditional audio guides require:
   - Physical device rental (hygiene concerns, deposit requirements)
   - Manual device operation (learning curve, battery management)
   - Fixed content (no personalization, outdated information)

3. **Navigation Friction**: Tourists must:
   - Manually search for POI information
   - Switch between multiple apps (maps, translation, audio guides)
   - Physically locate information plaques/QR codes at sites

4. **Content Ownership Gap**: POI owners (museums, historical sites, tour operators) lack:
   - Direct channel to publish/update content
   - Analytics on visitor engagement
   - Ability to monetize premium content

### 1.2 Real-World Impact
- **Tourist Experience**: 73% of non-English speaking tourists report difficulty accessing cultural information (internal survey, 2025)
- **POI Revenue Loss**: Sites lose potential premium guide revenue to third-party apps
- **Content Staleness**: Information updates take 6-12 months through traditional channels
- **Accessibility**: Visually impaired tourists have no audio-first navigation option

---

## 2. Why This System Exists

### 2.1 Vision
Create a **zero-friction, multilingual, location-aware audio guide platform** that:
- Automatically plays narration when tourists enter POI geofences
- Supports 4+ languages with on-demand translation
- Enables POI owners to publish and monetize content
- Provides real-time visitor analytics

### 2.2 Differentiation from Existing Solutions
| Feature | Traditional Audio Guide | Google Maps | VN-GO Travel |
|---------|------------------------|-------------|--------------|
| **Automatic Playback** | ❌ Manual start | ❌ Manual search | ✅ Geofence-triggered |
| **Multilingual** | ❌ 1-2 languages | ⚠️ Machine translation only | ✅ 4 languages + AI fallback |
| **Offline-First** | ✅ Yes | ❌ Requires internet | ✅ SQLite cache |
| **Owner Dashboard** | ❌ No | ❌ No | ✅ Analytics + content management |
| **Premium Tiers** | ❌ Fixed rental fee | ❌ No monetization | ✅ Free short / Premium long narration |

### 2.3 Technical Innovation
1. **Geofence Arbitration Kernel (GAK)**: Intelligent GPS coalescing to prevent battery drain while maintaining <5m accuracy
2. **ROEL/RBEL Telemetry Pipeline**: Decoupled observability layer for heatmap analytics without blocking UI
3. **Hybrid Translation Strategy**: Pre-translated (vi/en) + on-demand AI translation (zh/ja/ko) with SQLite caching

---

## 3. Stakeholders

### 3.1 Primary Stakeholders

#### 3.1.1 Tourists (End Users)
**Persona: International Traveler**
- **Demographics**: 25-55 years old, non-Vietnamese speakers
- **Tech Proficiency**: Medium (comfortable with mobile apps)
- **Pain Points**:
  - Cannot understand Vietnamese signage
  - Tired of manually searching for POI information
  - Want hands-free exploration (audio while walking)
- **Success Criteria**:
  - Narration starts automatically within 10 seconds of POI entry
  - Content available in native language
  - Works offline (no roaming data required)

#### 3.1.2 POI Owners (Content Publishers)
**Persona: Museum Director / Tour Operator**
- **Demographics**: Business owners, cultural site managers
- **Tech Proficiency**: Low-Medium (basic web dashboard usage)
- **Pain Points**:
  - No direct channel to update content (must go through app developers)
  - Cannot track visitor engagement (how many people visited? when?)
  - Lose revenue to third-party guide apps
- **Success Criteria**:
  - Can submit new POI via web form (no coding required)
  - See visitor heatmap (hourly/daily traffic patterns)
  - Monetize premium content (long-form narration)

#### 3.1.3 System Administrators
**Persona: Platform Operator**
- **Demographics**: Technical staff, content moderators
- **Tech Proficiency**: High (full system access)
- **Pain Points**:
  - Need to approve/reject owner submissions (quality control)
  - Monitor system health (telemetry, error rates)
  - Manage translation queue (AI costs, cache hit rates)
- **Success Criteria**:
  - Admin dashboard shows pending submissions
  - Real-time system metrics (GPS accuracy, TTS latency)
  - Heatmap aggregation works correctly (current bug: 1 device = no color)

### 3.2 Secondary Stakeholders

#### 3.2.1 Translation Service Providers
- **Role**: Provide AI translation API (OpenAI GPT-4)
- **Dependency**: System relies on external API for non-vi/en languages
- **Risk**: API downtime = no translation for zh/ja/ko users

#### 3.2.2 Map Data Providers
- **Role**: Provide base map tiles (OpenStreetMap via MAUI Maps)
- **Dependency**: Offline map tiles not implemented (requires internet for map rendering)

---

## 4. Current System Limitations

### 4.1 Architectural Limitations

#### 4.1.1 God ViewModel Anti-Pattern
**Problem**: `MapViewModel` has 800+ lines, handles:
- GPS tracking
- POI loading
- Audio playback
- Language switching
- UI state management

**Impact**:
- Difficult to test (tight coupling)
- Race conditions (concurrent state mutations)
- Hard to extend (adding features requires modifying monolithic class)

**Evidence**: See [ViewModels/MapViewModel.cs:1-850](../../ViewModels/MapViewModel.cs)

#### 4.1.2 In-Memory JSON Localization
**Problem**: All POI localizations loaded into RAM on app start

**Current Behavior**:
```csharp
// LocalizationService.cs:45
private Dictionary<string, Dictionary<string, PoiLocalization>> _cache = new();
// Loads ALL localizations for ALL POIs in ALL languages
```

**Impact**:
- 500 POIs × 4 languages × 2KB avg = 4MB RAM
- Startup delay (2-3 seconds on low-end devices)
- No lazy loading

#### 4.1.3 Polling-Based GPS (5-Second Interval)
**Problem**: `PeriodicTimer` polls GPS every 5 seconds regardless of movement

**Current Behavior**:
```csharp
// MapPage.xaml.cs:248
_timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
```

**Impact**:
- Battery drain (GPS active even when stationary)
- Delayed POI entry detection (up to 5 seconds)
- Wasted CPU cycles (distance calculation on every tick)

**Mitigation**: `GeofenceService` has 5m movement threshold, but timer still runs

### 4.2 Data Consistency Issues

#### 4.2.1 SQLite vs In-Memory Mismatch
**Problem**: POI data exists in 3 places with no synchronization:
1. Backend MongoDB (source of truth)
2. Client SQLite (offline cache)
3. `AppState.Pois` ObservableCollection (runtime state)

**Race Condition**:
```
T0: User opens app → SQLite loads 100 POIs into AppState.Pois
T1: Background sync fetches 105 POIs from server
T2: Sync updates SQLite
T3: AppState.Pois still has 100 POIs (stale)
T4: User enters new POI → Not in collection → No narration
```

**Evidence**: [Services/PoiHydrationService.cs:120-145](../../Services/PoiHydrationService.cs#L120-L145)

#### 4.2.2 Translation Cache Invalidation
**Problem**: No TTL on translated content in SQLite

**Scenario**:
1. User requests Japanese translation for POI001 → Cached in SQLite
2. POI owner updates English source text
3. Japanese cache is stale (still shows old translation)
4. No mechanism to detect source text changes

**Impact**: Users see outdated translations indefinitely

### 4.3 Heatmap System Failure (CRITICAL BUG)

#### 4.3.1 Root Cause
**Problem**: GeofenceService does NOT emit POI-linked telemetry events

**Expected Flow**:
```
Device enters POI → GeofenceService detects entry → Emits telemetry with poiCode
→ RBEL maps to LocationEvent → Backend creates PoiHourlyStats record
→ Owner sees heatmap color
```

**Actual Flow (BEFORE FIX)**:
```
Device enters POI → ObservingGeofenceService emits telemetry WITHOUT poiCode
→ Backend rejects event (LocationEvent must have poi_id)
→ No PoiHourlyStats record → Heatmap shows NO COLOR
```

**Impact**:
- Owner dashboard heatmap is non-functional
- 1 device entering POI = level 0 (no color) instead of level 1 (light green)
- Analytics completely broken for geofence-based entry

**Status**: FIXED on 2026-04-22 (see [docs/audit/heatmap_system_full_audit.md](../audit/heatmap_system_full_audit.md))

#### 4.3.2 Missing Heatmap Features
Even after fix, system lacks:
- **Real-time updates**: Owner must manually refresh page
- **Historical comparison**: Cannot compare this week vs last week
- **Export functionality**: No CSV/PDF export for reports
- **Predictive analytics**: No forecasting of peak hours

### 4.4 Premium Gating Inconsistency

#### 4.4.1 Map vs Detail Page Behavior
**Problem**: Premium check happens at different points in flow

**Map Page** ([Views/MapPage.xaml.cs:543-548](../../Views/MapPage.xaml.cs#L543-L548)):
```csharp
if (!_auth.IsPremium) {
    // Navigate to PoiDetailPage (shows upgrade dialog there)
    await _navService.NavigateToAsync(route);
    return;
}
await _vm.PlayPoiDetailedAsync(poi, _vm.CurrentLanguage);
```

**Detail Page** ([ViewModels/PoiDetailViewModel.cs:296-316](../../ViewModels/PoiDetailViewModel.cs#L296-L316)):
```csharp
if (!_auth.IsPremium) {
    var wantUpgrade = await DisplayAlertAsync("Gói Premium", ...);
    if (wantUpgrade) await UpgradeAsync();
    return;
}
```

**Inconsistency**:
- Map: Navigates away (user loses context)
- Detail: Shows dialog inline (better UX)

**Impact**: Confusing user experience (different behavior for same action)

### 4.5 Offline Limitations

#### 4.5.1 No Offline Translation
**Problem**: AI translation requires internet connection

**Scenario**:
1. User downloads app with vi/en content
2. Switches to Japanese (no internet)
3. Translation fails → Falls back to English
4. User sees English instead of Japanese (unexpected)

**Impact**: Offline-first promise broken for non-vi/en languages

#### 4.5.2 No Offline Map Tiles
**Problem**: MAUI Maps requires internet for tile rendering

**Current Behavior**:
```csharp
// MapPage.xaml.cs:385
Map.MoveToRegion(MapSpan.FromCenterAndRadius(center, Distance.FromMeters(500)));
// Fetches tiles from online source
```

**Impact**: Map shows blank gray screen without internet

---

## 5. Success Metrics

### 5.1 User Experience Metrics
- **POI Entry Detection Latency**: <5 seconds from geofence entry to narration start
- **Translation Cache Hit Rate**: >80% (reduce AI API costs)
- **Offline Availability**: 100% for vi/en content, 0% for zh/ja/ko (known limitation)

### 5.2 Owner Metrics
- **Heatmap Accuracy**: 1 device = level 1 color (light green) ✅ FIXED
- **Content Approval Time**: <24 hours from submission to approval
- **Dashboard Load Time**: <2 seconds for heatmap rendering

### 5.3 System Health Metrics
- **GPS Battery Impact**: <5% battery drain per hour of active use
- **Memory Footprint**: <50MB RAM (currently ~60MB due to in-memory JSON)
- **Crash Rate**: <0.1% (currently 0.3% due to collection mutation)

---

## 6. Out of Scope (Explicitly NOT Addressed)

### 6.1 Social Features
- User reviews/ratings of POIs
- Photo sharing
- Friend recommendations

**Rationale**: Focus on core audio guide functionality first

### 6.2 Augmented Reality
- AR overlays on camera view
- 3D POI models

**Rationale**: Requires significant R&D, not MVP

### 6.3 Multi-Platform
- iOS version (currently Android + Windows only)
- Web version (mobile-first design)

**Rationale**: Resource constraints, MAUI cross-platform support incomplete

### 6.4 Payment Integration
- In-app purchases for premium
- Owner revenue sharing

**Rationale**: Currently using local premium flag (demo mode), payment gateway integration deferred to Phase 2

---

## 7. Regulatory and Compliance Considerations

### 7.1 Data Privacy (GDPR/CCPA)
**Current Status**: ⚠️ PARTIAL COMPLIANCE

**Implemented**:
- Device ID hashing on backend (no PII in heatmap)
- No user tracking without authentication

**Missing**:
- No privacy policy in app
- No data deletion mechanism (user cannot request account deletion)
- No consent dialog for telemetry collection

### 7.2 Accessibility (WCAG 2.1)
**Current Status**: ❌ NON-COMPLIANT

**Missing**:
- No screen reader support (MAUI accessibility labels not implemented)
- No high-contrast mode
- No font size adjustment
- Audio-only navigation not tested with assistive technologies

**Impact**: Visually impaired users cannot use the app (ironic for an audio guide system)

---

## 8. Assumptions

### 8.1 Technical Assumptions
1. **GPS Accuracy**: Assumes device GPS accurate to ±10m (reality: 5-50m depending on environment)
2. **Network Availability**: Assumes intermittent connectivity (offline-first design)
3. **Device Capabilities**: Assumes Android 8.0+ with TTS engine installed
4. **Backend Uptime**: Assumes 99% uptime (no SLA defined)

### 8.2 Business Assumptions
1. **Content Quality**: Assumes POI owners provide accurate, non-offensive content (no automated fact-checking)
2. **Translation Quality**: Assumes GPT-4 translations are "good enough" (no human review)
3. **User Behavior**: Assumes users grant location permissions (app unusable without GPS)

### 8.3 Operational Assumptions
1. **Admin Availability**: Assumes admin reviews submissions within 24 hours (no automated approval)
2. **Translation Costs**: Assumes <$100/month AI API costs (scales with user growth)
3. **Storage Costs**: Assumes MongoDB Atlas free tier sufficient (currently 2GB used)

---

## 9. Constraints

### 9.1 Technical Constraints
- **MAUI Framework Limitations**: Cannot use native iOS/Android geofencing APIs (must poll GPS)
- **SQLite Performance**: Full-text search not implemented (linear scan for POI lookup)
- **TTS Engine**: Quality varies by device manufacturer (Samsung vs Xiaomi)

### 9.2 Resource Constraints
- **Development Team**: 1 full-stack developer (no dedicated mobile/backend specialists)
- **Budget**: $0 infrastructure costs (using free tiers: MongoDB Atlas, Azure App Service)
- **Time**: 6-month development cycle (MVP launched 2025-10, current version 2026-04)

### 9.3 Legal Constraints
- **Content Licensing**: No mechanism to verify POI owners have rights to publish content
- **Music/Audio**: No copyright checks on uploaded audio files (if feature added)

---

## 10. Risk Assessment

### 10.1 High-Risk Issues
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **GPS Inaccuracy** | High | High | Increase geofence radius to 50m (trade-off: early triggering) |
| **Translation API Downtime** | Medium | High | Implement fallback to English (already done) |
| **Heatmap Data Loss** | Low | Medium | Fixed on 2026-04-22, add monitoring |
| **Collection Mutation Crash** | Medium | High | Refactor to immutable collections (pending) |

### 10.2 Medium-Risk Issues
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Battery Drain Complaints** | Medium | Medium | Optimize GPS polling interval (pending) |
| **Stale Translation Cache** | High | Low | Add TTL to SQLite cache (pending) |
| **Admin Approval Bottleneck** | Low | Medium | Implement automated approval for trusted owners (pending) |

---

## 11. Conclusion

VN-GO Travel addresses a real problem (language barrier for tourists) with a technically innovative solution (geofence-triggered audio guides). However, the system suffers from:

1. **Architectural Debt**: God ViewModel, tight coupling, in-memory JSON
2. **Data Consistency Issues**: SQLite/RAM/Backend synchronization gaps
3. **Critical Bugs**: Heatmap system was non-functional (now fixed)
4. **Incomplete Features**: Offline translation, accessibility, payment integration

The system is **production-ready for MVP** but requires significant refactoring for scale and maintainability.

**Next Steps**:
1. Refactor MapViewModel into use cases (Clean Architecture)
2. Implement lazy loading for localizations
3. Add real-time heatmap updates (WebSocket)
4. Conduct accessibility audit and remediation
