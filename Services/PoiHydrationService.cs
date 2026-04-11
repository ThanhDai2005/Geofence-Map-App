using System.Collections.ObjectModel;
using System.Diagnostics;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;

namespace MauiApp1.Services;

/// <summary>
/// Owns all POI loading, hydration, and collection management logic.
/// Extracted from MapViewModel to give it a single, testable responsibility.
///
/// Responsibilities:
///   - Seeding SQLite from pois.json on first install
///   - Loading geo rows from SQLite and attaching in-memory localization
///   - Writing the result into AppState.Pois on the main thread
/// </summary>
public class PoiHydrationService
{
    private readonly IPoiQueryRepository _poiQuery;
    private readonly IPoiCommandRepository _poiCommand;
    private readonly ILocalizationService _locService;
    private readonly IPreferredLanguageService _languagePrefs;
    private readonly AppState _appState;
    private readonly SemaphoreSlim _loadGate = new(1, 1);

    public PoiHydrationService(
        IPoiQueryRepository poiQuery,
        IPoiCommandRepository poiCommand,
        ILocalizationService locService,
        IPreferredLanguageService languagePrefs,
        AppState appState)
    {
        _poiQuery = poiQuery;
        _poiCommand = poiCommand;
        _locService = locService;
        _languagePrefs = languagePrefs;
        _appState = appState;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public factory — used by multiple services / ViewModels
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Creates a NEW <see cref="Poi"/> instance that copies all geo/meta fields from
    /// <paramref name="core"/> and attaches <paramref name="result"/> as its localization.
    /// <para>
    /// Creating a new object (rather than mutating) is critical: MAUI's binding engine
    /// only re-reads bound properties when <c>PropertyChanged("SelectedPoi")</c> fires,
    /// which only fires when <c>SelectedPoi</c> receives a <em>different</em> reference.
    /// Mutating the existing object's <c>Localization</c> silently stales the UI (BUG-3 fix).
    /// </para>
    /// </summary>
    public static Poi CreateHydratedPoi(Poi core, LocalizationResult result)
    {
        var poi = new Poi
        {
            Id        = core.Id,
            Code      = core.Code,
            Latitude  = core.Latitude,
            Longitude = core.Longitude,
            Radius    = core.Radius,
            Priority  = core.Priority,
            IsFallback        = result.IsFallback,
            UsedLanguage      = result.UsedLang,
            RequestedLanguage = result.RequestedLang
        };
        poi.Localization = result.Localization; // set directly — avoids triggering bridge setters
        return poi;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Collection management
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Replaces <see cref="AppState.Pois"/> with a new collection on the main thread.
    /// </summary>
    public async Task RefreshPoisCollectionAsync(List<Poi> items)
    {
        await MainThread.InvokeOnMainThreadAsync(() =>
        {
            _appState.Pois = new ObservableCollection<Poi>(items);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Initial load
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Loads POIs from SQLite (seeding from <c>pois.json</c> on first run) and
    /// attaches localization for <paramref name="preferredLanguage"/> from the
    /// in-memory <see cref="LocalizationService"/> lookup.
    /// <para>
    /// Called once on app start. Language switching does NOT call this method —
    /// it uses <see cref="LanguageSwitchService.ApplyLanguageSelectionAsync"/> which
    /// re-hydrates in-memory objects without any DB or JSON I/O.
    /// </para>
    /// </summary>
    public async Task LoadPoisAsync(string? preferredLanguage = null)
    {
        await _loadGate.WaitAsync().ConfigureAwait(false);
        try
        {
            var sw = Stopwatch.StartNew();
            Debug.WriteLine("[MAP-LOAD] LoadPoisAsync START");

            await _poiQuery.InitAsync().ConfigureAwait(false);

            var targetLang = string.IsNullOrWhiteSpace(preferredLanguage)
                ? _appState.CurrentLanguage
                : PreferredLanguageService.NormalizeCode(preferredLanguage);

            // Initialize the localization lookup (no-op after first call).
            var tLocStart = sw.ElapsedMilliseconds;
            await _locService.InitializeAsync().ConfigureAwait(false);
            Debug.WriteLine($"[MAP-LOAD]  locService init: {sw.ElapsedMilliseconds - tLocStart} ms");

            // Seed database if empty (first install or fresh clear).
            var tSeedStart = sw.ElapsedMilliseconds;
            var existingCount = await _poiQuery.GetCountAsync().ConfigureAwait(false);
            if (existingCount == 0)
            {
                Debug.WriteLine("[MAP-LOAD] DB empty — seeding core POI data from pois.json");
                var corePois = _locService.GetCorePoisForSeeding();
                await _poiCommand.InsertManyAsync(corePois).ConfigureAwait(false);
                Debug.WriteLine($"[MAP-LOAD] Seeded {corePois.Count} core POIs into SQLite");
            }
            Debug.WriteLine($"[MAP-LOAD]  seed check: {sw.ElapsedMilliseconds - tSeedStart} ms");

            // Load all geo-only rows from SQLite.
            var tDbStart = sw.ElapsedMilliseconds;
            var poisFromDb = await _poiQuery.GetAllAsync().ConfigureAwait(false);
            Debug.WriteLine($"[MAP-LOAD]  DB fetch {poisFromDb.Count} rows: {sw.ElapsedMilliseconds - tDbStart} ms");

            // Hydrate each core Poi with localization for the target language.
            var tHydrateStart = sw.ElapsedMilliseconds;
            var hydrated = poisFromDb
                .Select(p => CreateHydratedPoi(p, _locService.GetLocalizationResult(p.Code, targetLang)))
                .ToList();

            var missing = hydrated.Count(p => p.Localization == null);
            Debug.WriteLine(
                $"[MAP-LOAD]  hydration: {sw.ElapsedMilliseconds - tHydrateStart} ms  " +
                $"hydrated={hydrated.Count}  missing_loc={missing}");

            await RefreshPoisCollectionAsync(hydrated);

            // Language state must be set on main thread as it triggers PropertyChanged notifications.
            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                _appState.CurrentLanguage = targetLang;
            });

            Debug.WriteLine($"[MAP-LOAD] LoadPoisAsync END total={sw.ElapsedMilliseconds} ms");
        }
        finally
        {
            _loadGate.Release();
        }
    }

}
