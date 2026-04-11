# VN-GO-Travel2 System Feature Breakdown

## 1. Core POI Engine & In-Memory Localization
**Classification: COMPLETE**
- **Purpose**: Initialize geospatial POI data and bind translated text content for O(1) lookups in the UI, separating database persistence from fast language swapping.
- **Files Involved**: `Services/PoiDatabase.cs`, `Services/LocalizationService.cs`, `ViewModels/MapViewModel.cs`
- **Logic Flow**: App starts → `MapViewModel` requests `LoadPoisAsync` → `LocalizationService` parses `pois.json` into an in-memory dictionary → `PoiDatabase` seeds SQLite with "shell" `Poi` instances (geo-only) if empty → System hydrates SQLite entries with the memory Dictionary based on `CurrentLanguage`.
- **Data Flow**: `pois.json` (Input File) → In-Memory Dictionary (`PoiLocalization`) & SQLite DB (`Poi` schema) → List of Hydrated `Poi` objects (Model) → UI Map Pins (Output).
- **Current Limitations**: Requires keeping an entire localization dictionary in memory. `pois.json` structure parsing is manually mapped.

## 2. Real-time Geofencing & Location Tracking
**Classification: PARTIAL**
- **Purpose**: Continuously monitor the device's physical GPS location, calculate proximity to all POIs, and identify if the user steps within the radius of a focal point to trigger automatic popup/narration.
- **Files Involved**: `Views/MapPage.xaml.cs`, `ViewModels/MapViewModel.cs`, `Services/GeofenceService.cs`, `Services/LocationService.cs`
- **Logic Flow**: `MapPage` kicks off a 5-second `PeriodicTimer` → Skips update if `_appState.IsModalOpen` → Pulls OS GPS Coordinates → Hands coordinates to `GeofenceService` → Uses Haversine formula to compute distances to all active `Pois` → Evaluates priority, radius, and 2-minute cooldowns → Automatically triggers `PlayPoiAsync`.
- **Data Flow**: Hardware GPS coords (Input) → `GeofenceService` distance filter (Process) → Identified Candidate POI → Selects map marker & plays Audio (Output).
- **Current Limitations**: 
  - Runs in a brute-force `foreach` loop measuring distance against *every* POI.
  - Lacks spatial indexing (R-Tree / QuadTree).
  - Susceptible to silent failures if `UpdateLocationAsync` takes too long to resolve.

## 3. Narrated TTS Audio Engine
**Classification: COMPLETE**
- **Purpose**: Speak the POI history/story using the mobile operating system's native text-to-speech engine without crashing or creating voice overlap (stuttering).
- **Files Involved**: `Services/AudioService.cs`
- **Logic Flow**: UI requests speech → Service validates a 2.5s debounce window → Uses `SemaphoreSlim` to sequentially block other parallel speech attempts → Performs a silent 0-volume warm-up speak on first use → Translates BCP-47 tags (e.g. `vi` to `vi-VN`) maps to OS voices → Speaks.
- **Data Flow**: `PoiCode` + `NarrativeText` + `LanguageCode` (Input) → `LangToLocales` Dictionary mapping & Semaphore Queue (Process) → OS Audio Hardware (Output).
- **Current Limitations**: `CancellationToken` cancellation occurs proactively. If a user spam-taps pins, the TTS engine might abruptly cut and restart instead of queuing smoothly, though this is partially handled by the debounce window.

## 4. Optical QR Scanner & Navigation
**Classification: BROKEN**
- **Purpose**: Connect physical world markers to digital stories by decoding Camera frames or allowing manual string entry, then routing the user to the correct mapping context.
- **Files Involved**: `Views/QrScannerPage.xaml.cs`, `ViewModels/QrScannerViewModel.cs`, `Services/PoiEntryCoordinator.cs`
- **Logic Flow**: Page Appears → Recreates `ZXing` camera view logic to bypass permission bugs → Camera detects Image Frame → Code checks `GetDedupeKey` with 450ms inter-frame cooldown → UI `IsDetecting` pauses → `PoiEntryCoordinator` immediately alters `CurrentPoiStore` → If validated in DB, invokes `Shell.Current.GoToAsync("//map")` → Map captures attributes to auto-play.
- **Data Flow**: Camera Hardware Bytes (Input) → ZXing string decode → 450ms Deduplication key → `PoiEntryRequest` (Process) → Shell Route + Modifying Global Store (Output).
- **Current Limitations**: 
  - **Critical Issue:** Rapid state changes to `CameraView.IsDetecting` mixed with OS Permissions and `RecreateCameraView` leaves the view entirely frozen frequently. 
  - **Double-Navigation:** `PoiEntryCoordinator` modifies `CurrentPoiStore` (which the Map listens to) AND performs a Shell route (which the Map also processes), creating twin resolving flows.

## 5. Dynamic Content Translation & Preloading
**Classification: BROKEN**
- **Purpose**: Remove rigid static translations by polling a serverless `Langbly` API for fallback text, and preemptively pre-translating neighboring points while the user walks or stares at the map.
- **Files Involved**: `Services/LangblyTranslationProvider.cs`, `Services/PoiTranslationService.cs`, `ViewModels/MapViewModel.cs`, `Services/LocalizationService.cs`
- **Logic Flow (On-Demand)**: Map requests Focus → `LocalizationService` returns `IsFallback=True` → Viewmodel halts, asks `PoiTranslationService` to fetch via HTTP → On success, uses `RegisterDynamicTranslation` in LocalizationService to cache it → Map is rehydrated.
- **Logic Flow (Preloader)**: `MapViewModel` starts an infinite `while(true)` task with `Task.Delay(5000)` → Locates a POI with `IsFallback=True` → Translates API in background → Updates the specific `ObservableCollection<Poi>` item on MainThread.
- **Data Flow**: `PoiCode` + Missing Target Lang (Input) → HTTP Langbly Cloud API (Process) → Parsed Localization JSON → Injected to In-Memory Dictionary (Output).
- **Current Limitations**:
  - **Critical Crash:** Background preloader uses MainThread to mutate elements in `Pois`. Simultaneously, the `Geofence` Tracking loop in `MapPage` enumerates over `_vm.Pois` on a thread-pool thread without locking. This creates a lethal `System.InvalidOperationException: Collection was modified` race condition.
