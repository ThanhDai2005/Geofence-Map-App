# Documentation vs. Implementation Analysis
## VN-GO-Travel2

This document cross-references all markdown documentation (`README.md`, `ClassDiagram.md`, `SequenceDiagram.md`, `ERD.md`, `architecture.md`, `QR_INTEGRATED_DOCUMENT.md`, `known-issues.md`) against the actual execution pathways and current C# `.NET MAUI` implementation.

---

## 1. Documented Business Requirements & Intentions

### Core System Behavior
* **Offline-First Resilience**: Use SQLite to store the geographic and identification footprint (`Core Poi`) to ensure it works without signal. (`README.md`, `known-issues.md`)
* **GPS & Geofencing Narrations**: Track GPS coordinates polling every 5 seconds, checking against POI radii. If the user wanders into a POI (and isn't explicitly occupied in a modal view), the system should automatically use TTS (Text-to-Speech) to read the short description. (`SequenceDiagram.md`)
* **Flexible Scanning Context**: Optical camera scans should pop open the `Map` view and auto-narrate, whereas manual entries should go straight to the `PoiDetail` view. (`QR_INTEGRATED_DOCUMENT.md`)
* **Graceful Degradation for Languages**: Text content should gracefully fall back in a chain: `Requested Language` -> `Vietnamese` -> `English` -> `First Available`. Missing gaps should trigger dynamic API translations padded into memory caches. (`LocalizationService`, `architecture.md`)

---

## 2. Critical Mismatches & Contradictions (Docs vs. Code)

### 🔴 Mismatch 1: The "Phantom" Navigation Service Lock 
* **What the Docs say**: Both the `ClassDiagram.md` and `SequenceDiagram.md` explicitly state that the `PoiEntryCoordinator` routes navigation commands through a strict `NavigationService`. This service supposedly utilizes a `SemaphoreSlim` concurrency lock ("Gatekeeper") to prevent duplicate Shell routing events.
* **What the Code does**: In `PoiEntryCoordinator.cs` (Line 123), it totally bypasses the `NavigationService` and calls `await Shell.Current.GoToAsync(route)` directly on the MainThread.
* **Impact**: The document implies a thread-safe navigation guard exists, but the codebase does not enforce it. This directly causes the twin racing-navigation errors observed during QR scanning handoffs.

### 🔴 Mismatch 2: The Rogue Background Preloading Task
* **What the Docs say**: `architecture.md` and `known-issues.md` talk about dynamic translations occurring as a fallback mechanism for missing locale files (`GetOrTranslateAsync`). They mention caching to SQLite to save API costs.
* **What the Code does**: In `MapViewModel.cs`, an undocumented `StartBackgroundPreloading()` task loops continuously (`while(true)`) every 5 seconds checking for fallbacks and secretly pushing elements into the `Pois` ObservableCollection. 
* **Impact**: The docs show a purely imperative translation pipeline (requested as needed). The codebase contains a hyper-aggressive background preloader that causes thread-locking crashes because it mutates collections actively read by the Map Geofencer. It violates the intended design scope entirely.

### 🟡 Mismatch 3: SQLite ERD Redundancy
* **What the Docs say**: `ERD.md` defines the `pois` table with schema fields: `Name`, `Summary`, `NarrationShort`, `NarrationLong`.
* **What the Code does**: `known-issues.md` and `architecture.md` mention that the core `.db` only stores geographic metadata. During hydration, all string localization text comes from `pois.json` injected via the `LocalizationService`. 
* **Impact**: The physical DB table structure shown in `ERD.md` contains obsolete string columns from a previous phase. They represent technical debt and are not actual "sources of truth" for the UI.

---

## 3. Design Assumptions & Insights

1. **Assumption: Memory is Infinite for JSON Locales**: The application parses the entirety of `pois.json` and shoves it into a persistent Singleton Dictionary (`LocalizationService.cs -> _lookup`). For the MVP, this assumption is harmless. For a nationwide database, allocating string memory for a massive dictionary upfront will cause mobile Out-Of-Memory (OOM) crashes.
2. **Assumption: "ObservableCollection" works on Background threads**: The developer assumed that shifting updates into `MainThread.InvokeOnMainThreadAsync` made altering the collection safe. However, they forgot that the *readers* (like the 5-second `foreach` loop in Map Tracking) must also be on the main thread, or the collection requires explicit locking mechanisms (`lock(Pois)`).
3. **Intent: "Idempotent / Immutable Hydration"**: To solve MAUI's notorious inability to track nested property changes for pins on a map, the developer ingeniously built a `CreateHydratedPoi` immutable factory. Whenever a language changes, they just destroy and rebuild new POI object references, forcing the Views to physically redraw. This was a very deliberate architectural choice to bend around MAUI's limitation.
