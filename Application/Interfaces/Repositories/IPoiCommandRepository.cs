using MauiApp1.Models;

namespace MauiApp1.ApplicationContracts.Repositories;

/// <summary>Write operations for core POI rows (SQLite).</summary>
public interface IPoiCommandRepository
{
    Task<int> InsertAsync(Poi poi, CancellationToken cancellationToken = default);

    Task<int> UpdateAsync(Poi poi, CancellationToken cancellationToken = default);

    Task<int> InsertManyAsync(IEnumerable<Poi> pois, CancellationToken cancellationToken = default);

    Task UpsertAsync(Poi poi, CancellationToken cancellationToken = default);

    Task UpsertManyAsync(IEnumerable<Poi> pois, CancellationToken cancellationToken = default);
}
