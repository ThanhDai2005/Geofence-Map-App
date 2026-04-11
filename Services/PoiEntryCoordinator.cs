using System.Diagnostics;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Controls;

namespace MauiApp1.Services;

public class PoiEntryCoordinator : IPoiEntryCoordinator
{
    private readonly IPoiQueryRepository _poiQuery;
    private readonly IQrScannerService _qr;
    private readonly INavigationService _navService;
    private readonly AppState _appState;
    private bool _isHandling;
    private string? _lastHandledCode;
    private DateTime _lastHandledAt = DateTime.MinValue;

    public PoiEntryCoordinator(
        IPoiQueryRepository poiQuery,
        IQrScannerService qr,
        INavigationService navService,
        AppState appState)
    {
        _poiQuery = poiQuery;
        _qr       = qr;
        _navService = navService;
        _appState   = appState;
    }

    public async Task<PoiEntryResult> HandleEntryAsync(PoiEntryRequest request, CancellationToken cancellationToken = default)
    {
        if (request == null) return new PoiEntryResult { Success = false, Error = "Request is null" };

        if (_isHandling)
            return new PoiEntryResult { Success = false, Error = "Busy" };

        _isHandling = true;
        try
        {
            var raw = request.RawInput;
            Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator.HandleEntryAsync start source={request.Source} rawLen={raw?.Length ?? 0}");

            var parsed = await _qr.ParseAsync(raw, cancellationToken).ConfigureAwait(false);
            if (!parsed.Success)
                return new PoiEntryResult { Success = false, Error = parsed.Error ?? "Invalid QR" };

            var code = parsed.Code!;

            // Update shared current POI state early so Map and other listeners can react.
            try
            {
                _appState.SetSelectedPoiByCode(code);
                Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator set current POI code={code}");
            }
            catch { }

            // TODO: Move to UseCase (Stage 4) — duplicate navigation guard / cooldown policy.
            try
            {
                if (!string.IsNullOrEmpty(_lastHandledCode) && string.Equals(_lastHandledCode, code, StringComparison.OrdinalIgnoreCase))
                {
                    var since = (DateTime.UtcNow - _lastHandledAt).TotalMilliseconds;
                    if (since >= 0 && since < 2000)
                    {
                        Debug.WriteLine($"[QR-NAV] Duplicate handle suppressed for code='{code}' since={since}ms");
                        return new PoiEntryResult { Success = true, Navigated = false };
                    }
                }
            }
            catch { }

            await _poiQuery.InitAsync(cancellationToken).ConfigureAwait(false);

            Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator parsed code={code}");

            var preferred = !string.IsNullOrWhiteSpace(request.PreferredLanguage)
                ? request.PreferredLanguage
                : _appState.CurrentLanguage;

            var core = await _poiQuery.GetByCodeAsync(code, null, cancellationToken).ConfigureAwait(false);
            if (core == null)
                return new PoiEntryResult { Success = false, Error = "POI not found in database" };

            Debug.WriteLine($"[QR-NAV] POI found: code={code} preferred_lang={preferred}");

            string route;
            if (request.NavigationMode == PoiNavigationMode.Map)
            {
                var qs = $"code={Uri.EscapeDataString(code)}&lang={Uri.EscapeDataString(preferred)}";
                if (request.Source == PoiEntrySource.Scanner)
                    qs += "&narrate=1";
                route = $"//map?{qs}";
            }
            else
            {
                route = $"/poidetail?code={Uri.EscapeDataString(code)}&lang={Uri.EscapeDataString(preferred)}";
            }

            Debug.WriteLine(
                $"[QR-NAV] PoiEntryCoordinator navigating mode={request.NavigationMode} route={route}");
            if (request.Source == PoiEntrySource.FutureDeepLink
                && request.NavigationMode == PoiNavigationMode.Detail)
            {
                Debug.WriteLine("[DL-NAV] Navigation to PoiDetail started");
            }

            await _navService.NavigateToAsync(route);

            if (request.Source == PoiEntrySource.FutureDeepLink
                && request.NavigationMode == PoiNavigationMode.Detail)
            {
                Debug.WriteLine("[DL-NAV] Navigation completed");
            }

            try
            {
                _lastHandledCode = code;
                _lastHandledAt = DateTime.UtcNow;
            }
            catch { }

            Debug.WriteLine($"[QR-NAV] PoiEntryCoordinator completed for code={code}");

            return new PoiEntryResult { Success = true, Navigated = true };
        }
        catch (Exception ex)
        {
            return new PoiEntryResult { Success = false, Error = ex.Message };
        }
        finally
        {
            _isHandling = false;
        }
    }
}
