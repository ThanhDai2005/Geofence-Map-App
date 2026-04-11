using Microsoft.Maui.Devices.Sensors;

namespace MauiApp1.ApplicationContracts.Services;

/// <summary>Proximity evaluation against loaded POIs (device + app state).</summary>
public interface IGeofenceService
{
    Task CheckLocationAsync(Location location, CancellationToken cancellationToken = default);
}
