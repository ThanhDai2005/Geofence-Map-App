using MauiApp1.Models;

namespace MauiApp1.ApplicationContracts.Repositories;

/// <summary>Read-only POI and schema access (SQLite).</summary>
public interface IPoiQueryRepository
{
    Task InitAsync(CancellationToken cancellationToken = default);

    Task<int> GetCountAsync(CancellationToken cancellationToken = default);

    Task<List<Poi>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<Poi?> GetByIdAsync(string id, CancellationToken cancellationToken = default);

    Task<Poi?> GetByCodeAsync(string code, string? lang = null, CancellationToken cancellationToken = default);

    Task<Poi?> GetAnyLanguageByCodeAsync(string code, CancellationToken cancellationToken = default);

    Task<Poi?> GetExactByCodeAndLanguageAsync(
        string code,
        string languageCode,
        CancellationToken cancellationToken = default);

    Task<List<Poi>> GetNearbyAsync(
        double latitude, 
        double longitude, 
        double radiusInMeters, 
        CancellationToken cancellationToken = default);
}
