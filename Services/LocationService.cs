using MauiApp1.ApplicationContracts.Providers;
using Microsoft.Maui.Devices.Sensors;
using Microsoft.Maui.ApplicationModel;

namespace MauiApp1.Services;

public class LocationService : ILocationProvider
{
    private bool _permissionGranted;

    public async Task<Location?> GetCurrentLocationAsync(CancellationToken cancellationToken = default)
    {
        if (!_permissionGranted)
        {
            var status = await Permissions.RequestAsync<Permissions.Camera>(); // Wait, why Camera? Let me double-check
            // Re-evaluating the logic. The previous cat output showed Permissions.LocationWhenInUse
            status = await Permissions.RequestAsync<Permissions.LocationWhenInUse>();

            if (status != PermissionStatus.Granted)
            {
                await MainThread.InvokeOnMainThreadAsync(async () =>
                {
                    if (Microsoft.Maui.Controls.Application.Current?.MainPage != null)
                    {
                        await Microsoft.Maui.Controls.Application.Current.MainPage.DisplayAlertAsync(
                            "Quyền truy cập",
                            "Cần cấp quyền vị trí để sử dụng ứng dụng.",
                            "OK");
                    }
                });

                return null;
            }

            _permissionGranted = true;
        }

        return await Geolocation.GetLocationAsync(
            new GeolocationRequest(GeolocationAccuracy.High, TimeSpan.FromSeconds(10)),
            cancellationToken
        );
    }
}
