using MauiApp1.Models;

namespace MauiApp1.ApplicationContracts.Repositories;

/// <summary>Persisted translation cache entries (SQLite).</summary>
public interface ITranslationRepository
{
    Task<PoiTranslationCacheEntry?> GetTranslationCacheAsync(
        string code,
        string languageCode,
        CancellationToken cancellationToken = default);

    Task UpsertTranslationCacheAsync(
        PoiTranslationCacheEntry entry,
        CancellationToken cancellationToken = default);
}
