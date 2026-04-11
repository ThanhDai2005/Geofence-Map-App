# VN-GO-Travel Project Architecture

## Architecture Overview

The application is built using **.NET MAUI** and predominantly follows the **Model-View-ViewModel (MVVM)** architectural pattern. 
It heavily utilizes **Dependency Injection (DI)** (configured in `MauiProgram.cs`) to decouple the UI from business logic and data access. The application combines this with a **Service-Oriented** structure where native device features (GPS, Text-To-Speech) and external APIs (Translation) are abstracted behind Singleton services.

### Core Architectural Concepts:
- **Presentation Layer (MVVM):** `Views` (XAML + Code-behind) bind to `ViewModels`, allowing reactive UI updates via `INotifyPropertyChanged`.
- **Service Layer / Application Logic:** Cross-cutting concerns and business logic are localized within `Services/` (e.g., `LocationService`, `AudioService`, `DeepLinkCoordinator`).
- **Data Access Layer:** Uses SQLite (`PoiDatabase.cs`) for local persistence, optimized into a "Core Location Data vs. Localized Text" separation, storing geographic properties while hydrating text dynamically.
- **Translation / API Layer:** Features a resilient chain of responsibility for translations. It requests translations from a primary API (`LangblyTranslationProvider`), optionally falls back to `GTranslateTranslationProvider`, and caches results in SQLite.

## Module Breakdown

| Module / Component Area | Responsibility | Key Files |
| :--- | :--- | :--- |
| **Views / Pages** | The UI presentation layer for the .NET MAUI App. Defines layouts in XAML and registers page routes. | `MapPage.xaml`, `QrScannerPage.xaml`, `ExplorePage.xaml`, `LanguageSelectorPage.xaml`, `PoiDetailPage.xaml` |
| **ViewModels** | UI Data-Binding components. Holds application state corresponding to the Views, processes UX commands, and coordinates Services. | `MapViewModel.cs` (Central Hub), `QrScannerViewModel.cs`, `LanguageSelectorViewModel.cs`, `PoiDetailViewModel.cs` |
| **Services (Business)** | Logic handlers representing features like Geofencing, Audio Text-To-Speech execution, Navigation parsing, and App State. | `AudioService.cs`, `GeofenceService.cs`, `LocationService.cs`, `PoiEntryCoordinator.cs` |
| **Services (Translation)** | Interfaces and adapters connecting to translation APIs. Resolves runtime POI language fallback text. | `LocalizationService.cs`, `PoiTranslationService.cs`, `LangblyTranslationProvider.cs`, `LanguagePackService.cs` |
| **Services (Deep Link)** | Coordinates mobile deep-linking logic, ensuring intents are queued and resolved when the `AppShell` becomes ready. | `DeepLinkCoordinator.cs`, `DeepLinkHandler.cs`, `PendingDeepLinkStore.cs` |
| **Data Layer (Services)** | Abstraction over the SQLite database. Note: It is housed in the `Services` folder instead of a dedicated `Data` or `Repositories` layer. | `PoiDatabase.cs` |
| **Models** | Pure C# data objects governing POIs, Geofence details, Translation Caches, and Language settings. | `Poi.cs`, `PoiLocalization.cs`, `PoiTranslationCacheEntry.cs`, `LanguagePack.cs` |

## Dependency Graph (Textual)

1. **Entry Point**
   - Application launches via `App.xaml.cs` -> loads `AppShell.xaml` -> Displays `MapPage`, `QrScannerPage`, etc.
   - `MauiProgram.cs` wires up all dependencies into the DI Container.

2. **Core Operations Graph (`MapViewModel` Node)**
   - `MapViewModel` [Depends on] -> `LocationService` (Fetches GPS)
   - `MapViewModel` [Depends on] -> `GeofenceService` (Proximity checking around POIs)
   - `MapViewModel` [Depends on] -> `AudioService` (Dictation / Text-to-Speech)
   - `MapViewModel` [Depends on] -> `CurrentPoiStore` (Listens to App State events)

3. **Data & Translation Pipeline (`PoiDatabase` & Localization Nodes)**
   - `MapViewModel` [Requests Data from] -> `PoiDatabase` (Gets core geographic DB rules)
   - `MapViewModel` [Requests Text from] -> `LocalizationService` (Fetches language text)
   - `LocalizationService` [Falls back to] -> `PoiTranslationService` (When text is missing)
   - `PoiTranslationService` [Requests API] -> `LangblyTranslationProvider` -> falls back to `GTranslateTranslationProvider`

4. **External Event Routing (`QrScanner` & Deep Linking Nodes)**
   - OS Intent / Camera Scan -> `DeepLinkCoordinator` or `QrResolver` -> `PoiEntryCoordinator` -> Updates `CurrentPoiStore` -> (Event Triggers) -> `MapViewModel`.

## Observations (Important!)

> [!CAUTION]
> **Anti-Patterns & Technical Debt Identified**
> 1. **"God Object" ViewModel:** The `MapViewModel.cs` is exceedingly large (~780 lines). It directly coordinates the database, GPS, geofencing, translation providers, background processes, and active audio sessions instead of delegating orchestration to a lower-level Domain layer.
> 2. **Service Folder Overcrowding:** The local SQLite Repository (`PoiDatabase.cs`), external APIs (`LangblyTranslationProvider.cs`), model state holders (`CurrentPoiStore.cs`), and global app behaviors (`AppState.cs`) are all dumped into the same `Services/` folder. This harms codebase modularity.
> 3. **Singleton vs Transient Misalignment:** `MapViewModel` is registered globally as a Singleton in `MauiProgram.cs`, whereas other ViewModels are Transient. While valid for keeping map state alive, holding onto system dependencies (`LocationService`, etc.) persistently runs a slight risk of memory leaks and unexpected behavior during Maui Page lifecycles.
> 4. **Infinite Background Loops in ViewModel:** `MapViewModel` initializes `StartBackgroundPreloading()`, creating a `while(true)` task running every 5 seconds. ViewModels should typically not own infinite background-service processing lifecycles.

> [!TIP]
> **Strong Architectural Patterns Present**
> 1. **Dynamic Data Hydration Pattern:** The application cleanly separates "Core Location" logic from "Localized Text". `PoiDatabase` holds optimized geographical data, which is hydrated with translated strings dynamically upon ViewModel access via the `CreateHydratedPoi` immutable clone method.
> 2. **State Decoupling / Event Sourcing:** Features like Deep Links and QR code scanning do not force UI changes directly on other Views. Instead, they update singleton state containers (`CurrentPoiStore`), which the active components listen to and respond appropriately.
> 3. **Concurrency Control:** High-risk async flows (like completely refreshing language sets) properly utilize `SemaphoreSlim` gates (`_langSwitchGate`) to serialize user requests and prevent race conditions.
