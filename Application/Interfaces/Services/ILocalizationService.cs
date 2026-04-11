using MauiApp1.Models;

namespace MauiApp1.ApplicationContracts.Services;

/// <summary>In-memory POI text lookup (bundled JSON + dynamic injection).</summary>
public interface ILocalizationService
{
    bool IsInitialized { get; }

    Task InitializeAsync(CancellationToken cancellationToken = default);

    PoiLocalization? GetLocalization(string code, string lang);

    LocalizationResult GetLocalizationResult(string code, string lang);

    IReadOnlyList<Poi> GetCorePoisForSeeding();

    void RegisterDynamicTranslation(string code, string lang, PoiLocalization loc);

    void CheckMissingTranslations();
}
