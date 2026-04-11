# VN-GO-Travel2 Runtime Behavior Analysis

## 1. Main User flows (End-to-End)

### A. App Launch & Map Initialization
This flow occurs when the user first opens the application and primarily navigates to the core feature: the Map.

**Sequence:**
1. **Startup Config:** `MauiProgram.CreateMauiApp()` registers services, DI containers, and SQLite DB (`Batteries_V2.Init()`).
2. **App Shell Entry:** `App.xaml.cs` initializes `AppShell`, laying out the 4 primary tabs (`explore`, `map`, `qrscan`, `about`).
3. **Map Load:**
   - Navigating to Map tab invokes `MapPage.OnAppearingAsync`.
   - Kicks off background `_vm.LoadPoisAsync()`.
     - Calls `_db.InitAsync()` and `_locService.InitializeAsync()`.
     - If SQLite DB is empty, seeds static geo-data from `pois.json`.
     - Hydrates POIs with the currently stored user language preference.
   - Starts tracking loop (`StartTrackingAsync()`) which runs every 5 seconds.

### B. QR Scan Flow (Camera to Map/Detail)
This represents the crucial real-world interaction of a user pointing their device at a QR point-of-interest.

**Sequence:**
1. **Scanner Appearance (`QrScannerPage`)**: 
   - Requests Camera permissions. If first time granted in session, performs a "hard recreate" of the `ZXing` view to bypass native handler black-screen bugs.
   - Starts a vertical scanning line animation.
2. **Frame Capture**:
   - `OnBarcodesDetected` is fired. 
   - Code checks for recent duplicates within an inter-frame cooldown of 450ms (`QrScannerViewModel.GetDedupeKey`). Lock `_barcodeSync` prevents parallel submission of multiple frames.
   - Deactivates scanner (`CameraView.IsDetecting = false`) and shifts UxPhase to `Recognizing`.
3. **Validation & Resolution**:
   - Calls `SubmitCodeAsync` -> sends `PoiEntryRequest` to `PoiEntryCoordinator.HandleEntryAsync`.
   - `PoiEntryCoordinator` immediately writes to `CurrentPoiStore.SetCurrentPoi` (Global App State).
   - Looks up the code in SQLite. If missing, bails out directly to `ApplyingFailureUi`.
   - Prevents duplicate navigations via a 2000ms cooldown cache `_lastHandledCode`/`_lastHandledAt`.
4. **Navigation Handoff**:
   - Shell routes to Map: `Shell.Current.GoToAsync("//map?code=...&lang=...&narrate=1")`.
   - `MapPage.ApplyQueryAttributes` grabs `code` & saves `_pendingNarrateAfterFocus = true`.
   - In `MapPage.OnAppearingAsync()`, it consumes the pending focus, points the map region to the POI coordinates, and triggers `_vm.PlayPoiAsync` to narrate it.

### C. Background Tracking & Auto-Play
Happens ambiently while the user has the Map open and physical location changes.

**Sequence:**
1. **Periodic Loop**: `MapPage.StartTrackingAsync` runs every 5 seconds.
2. **Modal Check**: Skips location updates if a modal (`_appState.IsModalOpen`) is active, preventing background logic from thrashing memory if user is in Language settings.
3. **Location Query**: `_vm.UpdateLocationAsync()` polls mobile hardware API.
4. **Collision Detection**: 
   - Scans against all geo-fences using `Location.CalculateDistance`. 
   - Defers to `_lastAutoPoiId` to avoid stuttering repeat plays of the same bounding-box.
5. **Auto-Pop & Speak**: If within `Radius` (e.g., 200m) of an unseen POI, highlights it on Map UI, slides up the Bottom Panel, and invokes TTS via `_audioService.SpeakAsync`.

---

## 2. Pain Points, Race Conditions & Unstable Logic

After an extensive review of the execution logic across ViewModels, Services, and Views, the following system fractures were identified:

### 🔴 Data Races in ObservableCollections
**Location:** `MapViewModel.cs` - `StartBackgroundPreloading()` vs `MapPage.xaml.cs` tracking loop.
- **The Issue:** The background preloader runs every 5 seconds independently. When it translates a POI, it directly replaces elements in the `Pois` collection: `Pois[index] = CreateHydratedPoi(...)`. However, the tracking loop in `MapPage` (`_vm.Pois.Select(p => ...).FirstOrDefault()`) iterates over `Pois` on a thread-pool thread **without any collection lock**. 
- **Consequence:** This will inevitably throw a `Collection was modified; enumeration operation may not execute` concurrent modification crash under high use while walking through zones.

### 🟡 Double-Trigger "Focus" Events on QR Scan
**Location:** `PoiEntryCoordinator.cs` + `MapViewModel.cs` + `MapPage.xaml.cs`
- **The Issue:** When a QR code is scanned, `PoiEntryCoordinator` executes *two* state modifications simultaneously:
  1. Calls `_currentPoiStore.SetCurrentPoi(code)`.
  2. Executes `Shell.Current.GoToAsync("//map...")`.
- Because `MapViewModel` listens to `_currentPoiStore.CurrentPoiChanged` (and immediately fires `FocusOnPoiByCodeAsync`), and `MapPage` receives the `ApplyQueryAttributes` (and also fires `FocusOnPoiByCodeAsync`), the map viewmodel resolves the POI twice concurrently.
- **Consequence:** Wasteful dual-lookups in SQLite, UI jitter, and potential TTS collision states if both try to initiate narration depending on the precise timing thread yielding. 

### 🟡 Fragile Camera State Cycle
**Location:** `QrScannerPage.xaml.cs`
- **The Issue:** `CameraView.IsDetecting` (ZXing binding) is flipped rapidly across `OnAppearing`, permission callbacks, `OnBarcodesDetected`, validations failures, and `TryStartScanLineAnimation`. The UI logic aggressively recreates the native camera pipeline object `RecreateCameraView()` on first permission grant.
- **Consequence:** Rapidly tapping "Camera Scan" or backgrounding the app simultaneously risks leaving the Scanner locked in a "frozen frame" state because native Android cameras take time to release unmanaged hooks while MAUI's `IsDetecting` property blindly toggles on the main thread.

### 🟠 Background Preloader Rate Limits
**Location:** `MapViewModel.cs` - `StartBackgroundPreloading()`
- **The Issue:** Loops every 5 seconds (`await Task.Delay(5000);`) and issues a translation request if a fallback object is detected.
- **Consequence:** If the translation service delays or fails, the loop instantly cycles logic. It also lacks a robust cancellation token (`CancellationToken (ct)`). If the `MapViewModel` gets discarded (less likely since it is Singleton, but good practice), this `while(true)` task runs forever consuming cycles as long as the OS process lives.

### 🟠 Unregulated Async Void Methods 
**Location:** `MapPage.xaml.cs` (`OnPinMarkerClicked`, `OnMapClicked`)
- **The Issue:** Usage of `async void` means any unhandled exceptions traversing out of `PlayPoiAsync()` or `FocusOnPoiByCodeAsync()` immediately crash the application environment. MAUI cannot catch exceptions bubbled out of `async void` delegates safely without `try...catch` wrappers.
