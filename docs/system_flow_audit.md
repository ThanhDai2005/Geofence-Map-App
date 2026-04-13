# VN-GO-Travel: Full System Flow Audit

This audit evaluates the architectural integrity, flow consistency, and operational safety of the VN-GO-Travel mobile application. It focuses on several critical subsystems: QR Scanning, Geofencing, Audio Narration, and the newly introduced Premium Gating.

---

## 1. System Flow Overview

### 🏁 App Initialization & Start
[MauiProgram] → [App] → [AppShell]
- Registers singletons (PoiNarrationService, AppState, GeofenceService, etc.).
- Shell initializes Tabs (Explore, Map, QR, Profile, etc.).

### 🔍 QR Scan → POI Details
[QrScannerPage] → [QrScannerViewModel] → [PoiEntryCoordinator] → [NavigationService] → [PoiDetailPage]
- **Flow**: User scans code → Coordinator resolves POI → NavigationService performs a thread-safe Shell transition to `/poidetail`.

### 📍 Map & Geofencing (Auto-Trigger)
[MapViewModel] → [LocationService] → [AppState.UpdateLocation] → [GeofenceService] → [AudioService]
- **Flow**: Background loop (MapViewModel) receives location → GeofenceService performs proximity check → If candidate found, triggers text-to-speech immediately.

### 🎧 Audio Narration (Manual)
[PoiDetailPage] → [PoiDetailViewModel] → [PoiNarrationService] → [AudioService]
- **Flow**: User clicks "Nghe" → ViewModel calls NarrationService → Handles translation if needed → Speaks via AudioService.

### 💎 Premium Interaction
[PoiDetailPage] → [PoiDetailViewModel] → [PremiumService] (Persistence)
- **Flow**: ViewModel checks local `Preferences` → Controls UI visibility and triggers 5-second preview for detailed narration.

---

## 2. Flow Diagrams

### **QR Navigation Flow**
```text
[User Action: Scan QR]
   ↓
[QrScannerViewModel.HandleScannedCodeAsync]
   ↓
[PoiEntryCoordinator.HandleEntryAsync]
   ↓
[NavigationService.NavigateToAsync("/poidetail?code=...")]
   ↓
[PoiDetailPage (Transient)]
   ↓
[PoiDetailViewModel.ApplyQueryAttributes]
   ↓
[PoiDetailViewModel.LoadPoiAsync] (Hydration)
```

### **Geofence Auto-Narration Flow**
```text
[MapViewModel.UpdateLocationAsync] (Loop)
   ↓
[GeofenceService.CheckLocationAsync]
   ↓
[Poi Snapshot from AppState] (Concurrency Guard)
   ↓
[Distance Proximity Logic]
   ↓
[AudioService.SpeakAsync] (Direct Call)
```

---

## 3. Detected Issues

### 🔴 Critical Issues

#### **Audio Overlap & Fragmentation**
- **Issue**: `GeofenceService` calls `AudioService.SpeakAsync` directly (GeofenceService.cs:181), bypassing `PoiNarrationService`.
- **Risk**: 
    1. **Overlapping Audio**: If a user is manually listening to a detailed narration and enters a geofence, the two narrations will play simultaneously.
    2. **Language Inconsistency**: `GeofenceService` does not trigger on-demand translations. If the app is in Japanese and the user enters a geofence for a non-translated POI, they will hear Vietnamese/English instead of a Japanese translation that `PoiNarrationService` would have triggered.

#### **Conflicting Premium Gating**
- **Issue**: There are two separate premium check logic paths:
    1. `PlayPoiAudioUseCase` (Clean Architecture layer) uses `ISubscriptionRepository`.
    2. `PoiDetailViewModel` (UI layer) uses `IPremiumService` (Local Preferences).
- **Risk**: `PlayPoiAudioUseCase` might throw an `UnauthorizedAccessException` while the UI believes the user is premium (or vice-versa), leading to button presses that do nothing or crash without UI feedback.

---

### 🟠 Medium Issues

#### **Duplicate POI Hydration Logic**
- **Issue**: `PoiDetailViewModel.LoadPoiAsync` (lines 191-212) manually constructs a `Poi` instance and attaches localization.
- **Risk**: `PoiHydrationService.CreateHydratedPoi` was designed specifically for this purpose to solve "BUG-3" (UI staling). Having a second implementation in the ViewModel increases maintenance risk and potential for UI binding bugs if one implementation deviates.

#### **Inconsistent Active Narration Tracking**
- **Issue**: `GeofenceService` does not update `AppState.ActiveNarrationCode`.
- **Risk**: If a user enters a geofence, audio starts, and then the user switches the app language, the audio will NOT restart in the new language because the "BUG-2 fix" logic in `LanguageSwitchService` depends on `ActiveNarrationCode`.

---

### 🟡 Minor Issues

#### **Sync-over-Async in Audio Stop**
- **Issue**: `PoiNarrationService.Stop()` (line 144) calls `_audioService.StopAsync().GetAwaiter().GetResult()`.
- **Risk**: This is a blocking call on the UI thread which can cause micro-stutters. While functional, it violates async best practices especially given `PoiNarrationService` is a singleton used across loops.

---

## 4. Conflict Map

| Component | Responsibility | Source of Truth | Conflict/Duplicate |
| :--- | :--- | :--- | :--- |
| **Audio Playback** | Orchestrating TTS | `PoiNarrationService` | `GeofenceService` calls `AudioService` directly. |
| **Premium State** | Authorizing access | `PremiumService` | `PlayPoiAudioUseCase` uses `ISubscriptionRepository`. |
| **POI Hydration** | Creating UI-ready models | `PoiHydrationService` | `PoiDetailViewModel` has its own hydration logic. |
| **Navigation** | App Transitions | `NavigationService` | Minimal risk, but `PoiDetailViewModel` uses `_navService` while some code-behind uses Shell directly. |

---

## 5. Risk Analysis

### **The "Audio Collision" Scenario**
- **Why dangerous**: Creates a cacophony of sound that the user cannot easily stop (since `GeofenceService` doesn't track what it started).
- **When it happens**: Walking between POIs while manually playing a "Detailed Narration".
- **Affected Subsystem**: UI (User Frustration), Audio (Platform-level resource conflict).

### **The "Language Switch Ghost"**
- **Why dangerous**: Breaks the "Premium Experience" where everything should be translated.
- **When it happens**: Language change while auto-playing audio triggered by geofence.
- **Affected Subsystem**: Localization, User Engagement.

---

## 6. Safe Refactor Suggestions (Non-Destructive)

1. **Centralize Geofence Audio**:
   - Update `GeofenceService` to call `PoiNarrationService.PlayPoiAsync(poiCode)` instead of `AudioService.SpeakAsync`.
   - This ensures all safety checks (Stop previous, Translation, Sync UI) are inherited automatically.

2. **Unify Premium Check**:
   - Make `PlayPoiAudioUseCase` depend on `IPremiumService` instead of `ISubscriptionRepository` (or have the Repository implementation use the Service).
   - This prevents "Split-Brain" logic regarding user status.

3. **Standardize Hydration**:
   - Refactor `PoiDetailViewModel.LoadPoiAsync` to use `PoiHydrationService.CreateHydratedPoi`.
   - Eliminates duplicate property mapping and ensures consistent "BUG-3" fixes.

4. **Async-ify Stop**:
   - Change `PoiNarrationService.Stop()` to `StopAsync()` and await it in ViewModels to remove the `.GetResult()` blocking call.

---
*End of Audit Report*
*Senior System Architect & Software Auditor*
