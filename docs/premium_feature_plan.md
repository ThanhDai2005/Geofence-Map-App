# Premium Feature System Implementation Plan

This document outlines a safe, non-destructive implementation plan for a Premium Feature system in the VN-GO-Travel .NET MAUI application. The system will allow users to access detailed narrations (`NarrationLong`) after "upgrading" to a premium state (local-only demo logic).

## 🧠 System Understanding Summary

- **Current State**:
    - `GeofenceService` handles auto-playing `NarrationShort` (FREE).
    - `PoiNarrationService` is the central hub for audio orchestration.
    - `PoiDetailViewModel` currently uses `PlayPoiAudioUseCase` which is restrictive (requires premium for any manual playback).
- **Goal**:
    - **NarrationShort**: Always FREE (Auto-play in geofence + manual button).
    - **NarrationLong**: PREMIUM (New button + upgrade flow).
    - **State Management**: Local `Preferences` storage, no backend required.

## 🛠️ Design Decisions

1.  **Premium Persistence**: Create a dedicated `IPremiumService` to encapsulate logic for reading/writing the `is_premium` flag to `Microsoft.Maui.Storage.Preferences`.
2.  **Tiered Narration Access**: 
    - The existing "Nghe" button will be repurposed to play `NarrationShort` (FREE).
    - A new "Nghe chi tiết" button will be added for `NarrationLong` (PREMIUM).
3.  **UI Feedback**: Use conditional visibility and `Style` overrides to show "locked" status for premium features to non-premium users.
4.  **Safe Modification Zones**: Only touch `PoiDetailViewModel`, `PoiDetailPage.xaml`, and create `PremiumService`. The fragile loop in `MapViewModel` and `GeofenceService` will be strictly avoided.

## 📐 Data Flow (Conceptual)

- **Input**: User clicks "Nghe chi tiết" in `PoiDetailPage`.
- **Validation**: `PoiDetailViewModel` checks `IPremiumService.IsPremium`.
- **Logic (Success)**: Call `PoiNarrationService.PlayPoiDetailedAsync(poi)`.
- **Logic (Fail)**: Display "Unlock Premium" popup/alert.
- **Persistence**: `Preferences.Set("is_premium", true)` when user clicks "Upgrade".

## 📋 Step-by-Step Implementation

### Phase 1: Infrastructure
1.  **Create `Services/PremiumService.cs`**:
    - Implement a simple service using `Microsoft.Maui.Storage.Preferences`.
    - Register it in `MauiProgram.cs` as a Singleton.

### Phase 2: ViewModel Logic (Safe Zone)
1.  **Inject Service**: Add `IPremiumService` to `PoiDetailViewModel`.
2.  **Expose Properties**:
    - `bool IsPremium`: Reactive property to update UI.
    - `Command PlayShortCommand`: Plays short narration (FREE).
    - `Command PlayDetailedCommand`: Plays long narration (PREMIUM gate).
    - `Command TogglePremiumCommand`: Simple demo logic to upgrade/downgrade.

### Phase 3: UI Integration
1.  **New Button**: Add ` Nghe chi tiết` button to `PoiDetailPage.xaml`.
2.  **Visual Marker**: Add a lock emoji `🔒` or styled icon to the detailed button if not premium.
3.  **Upgrade Hint**: Add a subtle text link or small button "Mở khóa Premium" under the main buttons.

## ⚠️ Risk & Mitigation

| Risk | Mitigation |
| :--- | :--- |
| **Breaking Geofence** | Do NOT modify `GeofenceService`. It already plays `NarrationShort` which remains free. |
| **Bypassing Logic** | `PoiNarrationService` is used for both short and long, so we only control the *entry point* in the ViewModel. |
| **UI Stale State** | Ensure `OnPropertyChanged` is called for all visibility-related properties when `IsPremium` changes. |

## 🚀 Future Extension Ideas
- **Trial Period**: Implement a time-based trial in `PremiumService`.
- **Real Payment**: Integrate Stripe or Google Play In-App Purchases in the `PremiumService` implementation layer.

---
*Created by Senior System Architect*
## 🔒 Additional Safety Constraints

- DO NOT modify PlayPoiAsync or GeofenceService
- DO NOT preload NarrationLong
- Always check premium BEFORE accessing NarrationLong
- Ensure audio playback is not overlapping (stop previous audio first)
- Avoid using PlayPoiAudioUseCase for NarrationLong if it contains premium gating

## 🎧 Audio Safety Rule

Before playing NarrationLong:
- Stop current playback
- Ensure single audio stream only

## 💡 UX Enhancement (Optional but Recommended)

- Provide 3–5 seconds preview of NarrationLong for non-premium users
- Then trigger upgrade prompt