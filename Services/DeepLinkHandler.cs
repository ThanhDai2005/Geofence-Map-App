using System.Threading.Tasks;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using System.Diagnostics;

namespace MauiApp1.Services;

/// <summary>
/// App-side stub for handling incoming external links. Planned only: does NOT wire platform entry points.
/// Reuses <see cref="PoiEntryCoordinator"/> to normalize, lookup and navigate to POI when possible.
/// </summary>
public class DeepLinkHandler
{
    private readonly IPoiEntryCoordinator _coordinator;
    private readonly IQrScannerService _qr;

    public DeepLinkHandler(IPoiEntryCoordinator coordinator, IQrScannerService qr)
    {
        _coordinator = coordinator;
        _qr = qr;
    }

    /// <summary>
    /// Handle a raw incoming link on the app side.
    /// This method does not register any platform callbacks; it merely provides a reuseable entry point
    /// so that platform code can call it later when wiring deep links.
    /// </summary>
    /// <param name="rawLink">The raw URL or payload string received from outside.</param>
    /// <param name="preferredLanguage">Optional preferred language for lookup.</param>
    public async Task<DeepLinkHandleResult> HandleIncomingLinkAsync(string rawLink, string? preferredLanguage = null)
    {
        if (string.IsNullOrWhiteSpace(rawLink))
            return new DeepLinkHandleResult { Success = false, Error = "Empty link" };

        Debug.WriteLine($"[DL-NAV] HandleIncomingLinkAsync raw={rawLink}");

        var request = new PoiEntryRequest
        {
            RawInput = rawLink,
            Source = PoiEntrySource.FutureDeepLink,
            PreferredLanguage = preferredLanguage,
            NavigationMode = PoiNavigationMode.Detail // Standard for external links
        };

        Debug.WriteLine("[DL-NAV] Invoking PoiEntryCoordinator");
        var entryResult = await _coordinator.HandleEntryAsync(request).ConfigureAwait(false);
        
        if (entryResult.Success)
        {
            Debug.WriteLine("[DL-NAV] Resolved POI successfully");
        }
        else
        {
            Debug.WriteLine($"[DL-NAV] HandleEntryAsync failed: {entryResult.Error}");
            
            // Show notification to user on failure
            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                if (Microsoft.Maui.Controls.Application.Current?.MainPage != null)
                {
                    await Microsoft.Maui.Controls.Application.Current.MainPage.DisplayAlertAsync(
                        "Lỗi liên kết", 
                        $"Không thể mở liên kết này: {entryResult.Error}", 
                        "OK");
                }
            });
        }

        return new DeepLinkHandleResult { Success = entryResult.Success, Error = entryResult.Error };
    }
}
