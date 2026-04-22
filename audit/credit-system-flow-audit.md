# Credit System Flow Audit
**Generated:** 2026-04-22  
**Purpose:** Complete reconstruction of POI entry, detail loading, narration triggers, and premium gating logic for Credit System integration

---

## Executive Summary

This audit maps the **complete flow** from POI discovery (QR/GPS) through detail viewing and narration playback, identifying all premium gating points and potential credit system intervention points.

**Key Findings:**
- Premium checks occur at **2 critical points**: PoiDetailViewModel.PlayDetailedAsync and MapPage.OnListenDetailedClicked
- AuthService.IsPremium is the **single source of truth** for premium status
- No credit/token system currently exists - only boolean premium flag
- NarrationShort is FREE, NarrationLong is PREMIUM-gated
- Multiple duplicate premium checks create maintenance burden

---

## 1. POI Entry Flow (QR / GPS)

### 1.1 QR Scan Entry Path

```
User scans QR
    ↓
QrScannerPage.OnDetectedAsync()
    ↓
PoiEntryCoordinator.HandleEntryAsync(request)
    ├─ Input: PoiEntryRequest { RawInput, Source, NavigationMode, PreferredLanguage }
    ├─ Processing:
    │   ├─ QrScannerService.ParseAsync(raw) → QrParseResult
    │   ├─ If secure token: HandleSecureScanAsync() → API call to /pois/scan
    │   └─ Else: NavigateByCodeAsync(code)
    ├─ Side Effects:
    │   ├─ MapUiStateArbitrator.ApplySelectedPoiByCodeAsync() → sets AppState.SelectedPoi
    │   ├─ PoiQuery.InitAsync() → ensures SQLite ready
    │   ├─ TrackQrScanAnalyticsAsync() → telemetry event
    │   └─ MergeScanResultIntoLocalAsync() → upsert POI + localization
    └─ Output: NavigateToAsync(route)
        ├─ If NavigationMode.Map: "//map?code={code}&lang={lang}&narrate=1"
        └─ If NavigationMode.Detail: "/poidetail?code={code}&lang={lang}"
```

**Files:**
- [Services/PoiEntryCoordinator.cs](Services/PoiEntryCoordinator.cs) (lines 69-292)
- [Services/QrScannerService.cs](Services/QrScannerService.cs)
- [Views/QrScannerPage.xaml.cs](Views/QrScannerPage.xaml.cs)

**Premium Gating:** ❌ None at entry level

---

### 1.2 GPS Proximity Entry Path

```
MapPage tracking loop (5s interval)
    ↓
MapViewModel.UpdateLocationAsync()
    ↓
GeofenceArbitrationKernel.PublishLocationAsync(location)
    ├─ Updates AppState.CurrentLocation
    └─ Triggers geofence evaluation
    ↓
MapPage.StartTrackingAsync() proximity detection
    ├─ Calculates distance to all POIs
    ├─ Filters by Radius
    ├─ Orders by Priority DESC, Distance ASC
    └─ Selects nearest POI
    ↓
MapUiStateArbitrator.ApplySelectedPoiAsync(poi)
    ├─ Sets AppState.SelectedPoi
    └─ Triggers SelectedPoiChanged event
    ↓
MapPage.ShowBottomPanelAsync()
    ↓
PoiNarrationService.PlayPoiAsync(poi) → AUTO-PLAYS SHORT NARRATION
```

**Files:**
- [Views/MapPage.xaml.cs](Views/MapPage.xaml.cs) (lines 287-403)
- [ViewModels/MapViewModel.cs](ViewModels/MapViewModel.cs) (lines 299-314)
- [Services/GeofenceService.cs](Services/GeofenceService.cs)

**Premium Gating:** ❌ None - auto-plays FREE short narration

---

## 2. POI Detail Loading Flow

### 2.1 Navigation to PoiDetailPage

```
Shell.NavigateToAsync("/poidetail?code={code}&lang={lang}")
    ↓
PoiDetailPage.ApplyQueryAttributes(query)
    ├─ Extracts: code, lang
    ├─ Cancels previous loading (CancellationTokenSource)
    └─ Calls: PoiDetailViewModel.LoadPoiAsync(code, lang)
```

**Files:**
- [ViewModels/PoiDetailViewModel.cs](ViewModels/PoiDetailViewModel.cs) (lines 159-185)
- [Views/PoiDetailPage.xaml.cs](Views/PoiDetailPage.xaml.cs)

---

### 2.2 PoiDetailViewModel.LoadPoiAsync() Flow

```
PoiDetailViewModel.LoadPoiAsync(code, lang)
    ├─ Input: code (string), lang (string, optional)
    ├─ Processing:
    │   ├─ LocalizationService.InitializeAsync() → loads pois.json into memory
    │   ├─ GetPoiDetailUseCase.ExecuteAsync(code) → fetches from SQLite
    │   │   └─ PoiQueryRepository.GetByIdAsync(code) or GetByCodeAsync(code)
    │   ├─ LocalizationService.GetLocalizationResult(code, lang)
    │   │   ├─ Lookup: (CODE_UPPER, lang_lower) in Dictionary
    │   │   ├─ Fallback chain: requested → vi → en → any → null
    │   │   └─ Returns: LocalizationResult { Localization, IsFallback, UsedLang, RequestedLang }
    │   └─ Creates NEW Poi instance (hydrated with localization)
    ├─ Side Effects:
    │   ├─ Sets PoiDetailViewModel.Poi property → triggers UI binding update
    │   ├─ MapViewModel.RequestFocusOnPoiCode() → syncs map state
    │   └─ MapUiStateArbitrator.ApplySelectedPoiAsync() → updates AppState.SelectedPoi
    └─ Output: Poi object bound to UI
```

**Files:**
- [ViewModels/PoiDetailViewModel.cs](ViewModels/PoiDetailViewModel.cs) (lines 193-261)
- [Application/UseCases/GetPoiDetailUseCase.cs](Application/UseCases/GetPoiDetailUseCase.cs)
- [Services/LocalizationService.cs](Services/LocalizationService.cs) (lines 145-200)

**Premium Gating:** ❌ None - loading is free

---

## 3. Narration Trigger Flow

### 3.1 NarrationShort (FREE) - PoiDetailPage

```
User taps "🔊 Phát" button
    ↓
PoiDetailPage.OnPlayClicked()
    ↓
PoiDetailViewModel.PlayAsync()
    ├─ Checks: Poi != null, !IsBusy
    ├─ Calls: PoiNarrationService.Stop() → stops existing audio
    └─ Calls: PoiNarrationService.PlayPoiAsync(Poi)
        ├─ Resolves language: lang ?? AppState.CurrentLanguage
        ├─ Sets: AppState.ActiveNarrationCode = poi.Code
        ├─ EnsureTranslatedAsync(poi, code, lang)
        │   ├─ LocalizationService.GetLocalizationResult(code, lang)
        │   ├─ If non-vi/en AND (missing OR fallback):
        │   │   ├─ TranslationQueue.Enqueue(code, lang)
        │   │   ├─ Waits for TranslationCompletedMessage (15s timeout)
        │   │   └─ Re-fetches localization after translation
        │   └─ Returns: (hydratedPoi, locResult)
        ├─ SyncUiAsync(hydratedPoi) → updates AppState.SelectedPoi + Pois collection
        ├─ SelectShortText(poi):
        │   └─ Returns: NarrationShort ?? Name ?? ""
        ├─ TrackNarrationInteraction(code, "audio_play_short") → telemetry
        └─ AudioService.SpeakAsync(code, text, lang) → TTS playback
```

**Files:**
- [Views/PoiDetailPage.xaml.cs](Views/PoiDetailPage.xaml.cs) (lines 43-45)
- [ViewModels/PoiDetailViewModel.cs](ViewModels/PoiDetailViewModel.cs) (lines 268-284)
- [Services/PoiNarrationService.cs](Services/PoiNarrationService.cs) (lines 71-96)

**Premium Gating:** ❌ None - NarrationShort is FREE

---

### 3.2 NarrationLong (PREMIUM) - PoiDetailPage

```
User taps "🔊 Nghe chi tiết" button
    ↓
PoiDetailPage.OnPlayDetailedClicked()
    ↓
PoiDetailViewModel.PlayDetailedAsync()
    ├─ Checks: Poi != null, !IsBusy
    ├─ ⚠️ PREMIUM GATE #1:
    │   └─ If !AuthService.IsPremium:
    │       ├─ Shows alert: "Gói Premium" / "Thuyết minh chi tiết chỉ dành cho tài khoản Premium..."
    │       ├─ Options: "Nâng cấp" / "Để sau"
    │       └─ If "Nâng cấp": calls UpgradeAsync() → sets local premium flag
    ├─ If IsPremium:
    │   ├─ Calls: PoiNarrationService.Stop()
    │   └─ Calls: PoiNarrationService.PlayPoiDetailedAsync(Poi)
    │       ├─ Sets: AppState.ActiveNarrationCode = poi.Code
    │       ├─ EnsureTranslatedAsync(poi, code, lang) → same as short
    │       ├─ SyncUiAsync(hydratedPoi)
    │       ├─ SelectLongText(poi):
    │       │   └─ Returns: NarrationLong ?? NarrationShort ?? Name ?? ""
    │       ├─ TrackNarrationInteraction(code, "audio_play_long")
    │       └─ AudioService.SpeakAsync(code, text, lang)
    └─ Output: TTS playback of long narration
```

**Files:**
- [Views/PoiDetailPage.xaml.cs](Views/PoiDetailPage.xaml.cs) (lines 53-56)
- [ViewModels/PoiDetailViewModel.cs](ViewModels/PoiDetailViewModel.cs) (lines 291-329)
- [Services/PoiNarrationService.cs](Services/PoiNarrationService.cs) (lines 131-154)

**Premium Gating:** ✅ **GATE #1** - Line 296 in PoiDetailViewModel.cs

---

### 3.3 NarrationLong (PREMIUM) - MapPage

```
User taps "🔊 Nghe chi tiết" button on map bottom panel
    ↓
MapPage.OnListenDetailedClicked()
    ├─ Checks: SelectedPoi != null
    ├─ If !AuthService.IsAuthenticated:
    │   └─ Plays SHORT narration only (MapViewModel.PlayPoiAsync)
    ├─ ⚠️ PREMIUM GATE #2:
    │   └─ If !AuthService.IsPremium:
    │       └─ Navigates to PoiDetailPage (where GATE #1 will trigger)
    └─ If IsPremium:
        └─ Calls: MapViewModel.PlayPoiDetailedAsync(poi, lang)
            └─ Delegates to PoiNarrationService.PlayPoiDetailedAsync()
```

**Files:**
- [Views/MapPage.xaml.cs](Views/MapPage.xaml.cs) (lines 530-551)

**Premium Gating:** ✅ **GATE #2** - Line 543 in MapPage.xaml.cs

---

## 4. Premium Gating Architecture

### 4.1 AuthService - Single Source of Truth

```
AuthService (Singleton)
    ├─ Properties:
    │   ├─ IsAuthenticated: bool (derived from JWT token presence)
    │   ├─ IsPremium: bool (stored in SecureStorage + in-memory)
    │   ├─ Email: string?
    │   ├─ Role: string (USER/OWNER/ADMIN)
    │   └─ UserId: string?
    ├─ Storage Keys:
    │   ├─ vngo_auth_jwt → JWT token
    │   ├─ vngo_auth_premium → "true" / "false"
    │   ├─ vngo_auth_email
    │   ├─ vngo_auth_role
    │   └─ vngo_auth_userid
    ├─ Methods:
    │   ├─ RestoreSessionAsync() → loads from SecureStorage on app start
    │   ├─ LoginAsync(email, password) → API call, stores JWT + premium flag
    │   ├─ RegisterAsync(email, password) → API call, stores JWT + premium flag
    │   ├─ UpdateStoredPremiumAsync(isPremium) → local upgrade (demo mode)
    │   └─ LogoutAsync() → clears all storage
    └─ Events:
        ├─ PropertyChanged (IsPremium, IsAuthenticated, etc.)
        └─ SessionChanged
```

**Files:**
- [Services/AuthService.cs](Services/AuthService.cs)

**Current Implementation:**
- Premium is a **boolean flag** stored in SecureStorage
- No credit/token system exists
- No API endpoint for premium purchase/verification
- Local upgrade via `UpdateStoredPremiumAsync()` is demo-only

---

### 4.2 Premium Check Locations

| Location | File | Line | Check | Action if Not Premium |
|----------|------|------|-------|----------------------|
| **GATE #1** | PoiDetailViewModel.cs | 296 | `!_auth.IsPremium` | Show upgrade dialog |
| **GATE #2** | MapPage.xaml.cs | 543 | `!_auth.IsPremium` | Navigate to PoiDetailPage |
| PlayPoiAudioUseCase | PlayPoiAudioUseCase.cs | 28 | `!_subscriptionRepository.HasActiveSubscriptionAsync()` | Throw UnauthorizedAccessException |

**Note:** PlayPoiAudioUseCase is **NOT currently used** in the UI flow - it's a Clean Architecture artifact that's bypassed by direct PoiNarrationService calls.

---

## 5. Data Flow Diagram (Text-Based)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          POI ENTRY SOURCES                               │
├─────────────────────────────────────────────────────────────────────────┤
│  QR Scan                    GPS Proximity                Deep Link       │
│     │                             │                          │           │
│     └─────────────────┬───────────┴──────────────────────────┘           │
│                       ↓                                                  │
│              PoiEntryCoordinator                                         │
│                       │                                                  │
│                       ├─→ MapUiStateArbitrator.ApplySelectedPoiByCodeAsync│
│                       │   └─→ AppState.SelectedPoi = poi                 │
│                       │                                                  │
│                       └─→ Shell.NavigateToAsync(route)                   │
│                           ├─→ "//map?code=X&lang=Y&narrate=1"           │
│                           └─→ "/poidetail?code=X&lang=Y"                │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         DETAIL LOADING                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  PoiDetailViewModel.LoadPoiAsync(code, lang)                            │
│     │                                                                    │
│     ├─→ GetPoiDetailUseCase.ExecuteAsync(code)                          │
│     │   └─→ PoiQueryRepository.GetByCodeAsync(code)                     │
│     │       └─→ SQLite: SELECT * FROM pois WHERE Code = ?               │
│     │                                                                    │
│     ├─→ LocalizationService.GetLocalizationResult(code, lang)           │
│     │   ├─→ In-memory Dictionary lookup: (CODE, lang)                   │
│     │   └─→ Fallback chain: requested → vi → en → any → null           │
│     │                                                                    │
│     └─→ PoiHydrationService.CreateHydratedPoi(core, locResult)          │
│         └─→ NEW Poi instance with Localization attached                 │
│                                                                          │
│  ⚠️ NO PREMIUM GATE - Loading is FREE                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      NARRATION PLAYBACK                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  User Action: Tap "🔊 Phát" (Play Short)                                │
│     │                                                                    │
│     └─→ PoiNarrationService.PlayPoiAsync(poi)                           │
│         ├─→ EnsureTranslatedAsync() → on-demand translation if needed   │
│         ├─→ SelectShortText() → NarrationShort ?? Name                  │
│         └─→ AudioService.SpeakAsync(text, lang)                         │
│                                                                          │
│  ⚠️ NO PREMIUM GATE - Short narration is FREE                           │
├─────────────────────────────────────────────────────────────────────────┤
│  User Action: Tap "🔊 Nghe chi tiết" (Play Long)                        │
│     │                                                                    │
│     └─→ PoiDetailViewModel.PlayDetailedAsync()                          │
│         │                                                                │
│         ├─→ ✅ PREMIUM GATE #1: if (!AuthService.IsPremium)             │
│         │   ├─→ Show alert: "Gói Premium required"                      │
│         │   └─→ Option: "Nâng cấp" → UpgradeAsync()                     │
│         │                                                                │
│         └─→ If Premium: PoiNarrationService.PlayPoiDetailedAsync(poi)   │
│             ├─→ EnsureTranslatedAsync()                                 │
│             ├─→ SelectLongText() → NarrationLong ?? NarrationShort ?? Name│
│             └─→ AudioService.SpeakAsync(text, lang)                     │
│                                                                          │
│  ✅ PREMIUM GATE ACTIVE                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. SQLite Repository Layer

### 6.1 PoiQueryRepository Interface

```csharp
public interface IPoiQueryRepository
{
    Task InitAsync(CancellationToken ct = default);
    Task<Poi?> GetByIdAsync(string id, CancellationToken ct = default);
    Task<Poi?> GetByCodeAsync(string code, string? lang = null, CancellationToken ct = default);
    Task<List<Poi>> GetAllAsync(CancellationToken ct = default);
    Task<int> GetCountAsync(CancellationToken ct = default);
}
```

**Implementation:** [Infrastructure/Local/PoiLocalRepository.cs](Infrastructure/Local/PoiLocalRepository.cs)

**Storage:**
- SQLite database: `pois.db`
- Table: `pois`
- Schema: Id (PK), Code, LanguageCode, Name, Summary, NarrationShort, NarrationLong, Latitude, Longitude, Radius, Priority

**Seeding:**
- First run: loads from `pois.json` (embedded resource)
- Handled by: PoiHydrationService.LoadPoisAsync()

---

## 7. Credit System Intervention Points

### 7.1 Recommended Integration Points

| Point | Location | Current Behavior | Credit System Behavior |
|-------|----------|------------------|------------------------|
| **A. Detail Page Load** | PoiDetailViewModel.LoadPoiAsync() | Free | Deduct 1 credit on load? (Optional) |
| **B. Short Narration** | PoiNarrationService.PlayPoiAsync() | Free | Keep FREE or deduct 0.5 credit |
| **C. Long Narration** | PoiDetailViewModel.PlayDetailedAsync() | Premium gate | **Deduct 2-5 credits** |
| **D. Translation Request** | PoiNarrationService.EnsureTranslatedAsync() | Free (queued) | Deduct 1 credit per translation |
| **E. QR Scan** | PoiEntryCoordinator.HandleEntryAsync() | Free | Keep FREE (discovery) |

---

### 7.2 Proposed Credit Service Architecture

```csharp
public interface ICreditService
{
    Task<int> GetBalanceAsync(string userId);
    Task<bool> HasSufficientCreditsAsync(string userId, int required);
    Task<CreditDeductionResult> DeductCreditsAsync(string userId, int amount, string reason, string? poiCode = null);
    Task<CreditAdditionResult> AddCreditsAsync(string userId, int amount, string reason);
    Task<List<CreditTransaction>> GetTransactionHistoryAsync(string userId, int limit = 50);
}

public class CreditDeductionResult
{
    public bool Success { get; set; }
    public int RemainingBalance { get; set; }
    public string? ErrorMessage { get; set; }
}
```

**Integration Example:**

```csharp
// In PoiDetailViewModel.PlayDetailedAsync()
public async Task PlayDetailedAsync()
{
    if (Poi == null || IsBusy) return;

    // NEW: Credit check
    var userId = _auth.UserId;
    if (!string.IsNullOrEmpty(userId))
    {
        var hasCredits = await _creditService.HasSufficientCreditsAsync(userId, 3);
        if (!hasCredits)
        {
            await ShowInsufficientCreditsDialogAsync();
            return;
        }
    }

    // OLD: Premium check (can be removed or kept as fallback)
    if (!_auth.IsPremium)
    {
        // ... existing premium gate logic
    }

    IsBusy = true;
    try
    {
        _narrationService.Stop();
        await _narrationService.PlayPoiDetailedAsync(Poi);

        // NEW: Deduct credits after successful playback
        if (!string.IsNullOrEmpty(userId))
        {
            await _creditService.DeductCreditsAsync(userId, 3, "narration_long", Poi.Code);
        }
    }
    finally
    {
        IsBusy = false;
    }
}
```

---

## 8. Issues & Risks

### 8.1 Duplicate Premium Checks

**Problem:** Premium gating logic is duplicated in 2 locations:
- PoiDetailViewModel.PlayDetailedAsync() (line 296)
- MapPage.OnListenDetailedClicked() (line 543)

**Risk:** Inconsistent behavior if one check is updated but not the other.

**Recommendation:** Centralize premium/credit check in PoiNarrationService.PlayPoiDetailedAsync() and remove UI-level checks.

---

### 8.2 PlayPoiAudioUseCase Not Used

**Problem:** Clean Architecture use case exists but is bypassed by direct service calls.

**Current Flow:**
```
ViewModel → PoiNarrationService → AudioService
```

**Intended Flow:**
```
ViewModel → PlayPoiAudioUseCase → PoiNarrationService → AudioService
```

**Recommendation:** Either remove unused use case or refactor to use it consistently.

---

### 8.3 No Server-Side Premium Verification

**Problem:** Premium flag is stored locally in SecureStorage and can be manipulated.

**Risk:** Users can set `vngo_auth_premium = "true"` manually to bypass gates.

**Recommendation:** 
1. Add server-side credit balance API endpoint
2. Verify credits on each narration request
3. Store credit balance server-side, not client-side

---

### 8.4 Race Conditions in Translation

**Problem:** Multiple concurrent translation requests for the same POI can cause duplicate API calls.

**Mitigation:** SemaphoreSlim `_translationGate` in PoiNarrationService (line 195) serializes translation requests.

**Status:** ✅ Already handled

---

### 8.5 No Offline Credit Tracking

**Problem:** If user goes offline, credit deductions cannot be recorded.

**Recommendation:**
1. Queue credit deductions locally (SQLite)
2. Sync to server when online
3. Show "offline mode" indicator with limited functionality

---

## 9. Summary of Intervention Points

### 9.1 High-Priority Integration Points

1. **PoiDetailViewModel.PlayDetailedAsync()** (line 291)
   - Replace premium check with credit check
   - Deduct 3-5 credits for long narration
   - Show insufficient credits dialog

2. **PoiNarrationService.PlayPoiDetailedAsync()** (line 131)
   - Add credit verification before TTS
   - Track credit usage in telemetry

3. **AuthService** (entire file)
   - Add `CreditBalance` property
   - Add `RefreshCreditBalanceAsync()` method
   - Subscribe to credit balance changes from API

### 9.2 Optional Integration Points

4. **PoiNarrationService.EnsureTranslatedAsync()** (line 181)
   - Deduct 1 credit per on-demand translation
   - Show translation cost before triggering

5. **PoiDetailViewModel.LoadPoiAsync()** (line 193)
   - Deduct 0.5 credit for detail page view (premium content)
   - Keep free for basic info

---

## 10. Recommended Implementation Steps

1. **Phase 1: Backend API**
   - Create `credits` table in MongoDB
   - Add endpoints: GET /users/:id/credits, POST /users/:id/credits/deduct
   - Add credit balance to JWT payload

2. **Phase 2: Client Service**
   - Create `CreditService.cs` with interface
   - Integrate with AuthService for user context
   - Add local SQLite cache for offline support

3. **Phase 3: UI Integration**
   - Replace premium checks with credit checks in ViewModels
   - Add credit balance display in ProfilePage
   - Add "Insufficient Credits" dialog with purchase flow

4. **Phase 4: Analytics**
   - Track credit deductions in telemetry
   - Add credit usage heatmap to admin dashboard
   - Monitor credit abuse patterns

---

## Appendix A: File Reference Index

| Component | File Path | Lines of Interest |
|-----------|-----------|-------------------|
| PoiEntryCoordinator | Services/PoiEntryCoordinator.cs | 69-292 |
| PoiDetailViewModel | ViewModels/PoiDetailViewModel.cs | 15-403 |
| PoiNarrationService | Services/PoiNarrationService.cs | 27-342 |
| AuthService | Services/AuthService.cs | 8-328 |
| LocalizationService | Services/LocalizationService.cs | 15-315 |
| PoiHydrationService | Services/PoiHydrationService.cs | 19-350 |
| MapViewModel | ViewModels/MapViewModel.cs | 35-323 |
| MapPage | Views/MapPage.xaml.cs | 15-563 |
| PoiDetailPage | Views/PoiDetailPage.xaml.cs | 6-62 |
| AppState | Services/AppState.cs | 13-164 |
| Poi Model | Models/Poi.cs | 10-93 |
| GetPoiDetailUseCase | Application/UseCases/GetPoiDetailUseCase.cs | 8-29 |
| PlayPoiAudioUseCase | Application/UseCases/PlayPoiAudioUseCase.cs | 9-52 |

---

**End of Audit**
