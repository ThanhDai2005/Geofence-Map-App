using MauiApp1.Models;

namespace MauiApp1.ApplicationContracts.Services;

/// <summary>Centralizes raw POI entry (QR, manual, deep link) → navigation.</summary>
public interface IPoiEntryCoordinator
{
    Task<PoiEntryResult> HandleEntryAsync(PoiEntryRequest request, CancellationToken cancellationToken = default);
}
