using Microsoft.Maui.Devices.Sensors;

namespace MauiApp1.ApplicationContracts.Providers;

/// <summary>Device GPS / location access.</summary>
public interface ILocationProvider
{
    Task<Location?> GetCurrentLocationAsync(CancellationToken cancellationToken = default);
}
