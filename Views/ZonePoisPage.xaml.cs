using System.Collections.ObjectModel;
using System.Diagnostics;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Models;
using Microsoft.Maui.Controls;

namespace MauiApp1.Views;

public partial class ZonePoisPage : ContentPage
{
    private readonly IPoiQueryRepository _poiQuery;
    private readonly ApiService _apiService;
    private readonly AuthService _authService;

    private string? _zoneCode;
    private string? _zoneName;
    private string? _language;
    private ObservableCollection<PoiListItem> _pois = new();

    public ZonePoisPage(IPoiQueryRepository poiQuery, ApiService apiService, AuthService authService)
    {
        InitializeComponent();
        _poiQuery = poiQuery;
        _apiService = apiService;
        _authService = authService;

        PoisCollectionView.ItemsSource = _pois;
    }

    protected override async void OnNavigatedTo(NavigatedToEventArgs args)
    {
        base.OnNavigatedTo(args);

        // Parse query parameters
        if (Uri.TryCreate(Navigation.NavigationStack.LastOrDefault()?.GetType().Name ?? "", UriKind.Relative, out var uri))
        {
            var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
            _zoneCode = query["zoneCode"];
            _zoneName = query["zoneName"];
            _language = query["lang"] ?? "vi";
        }

        await LoadZonePoisAsync();
    }

    private async Task LoadZonePoisAsync()
    {
        try
        {
            LoadingIndicator.IsRunning = true;
            LoadingIndicator.IsVisible = true;

            if (string.IsNullOrEmpty(_zoneCode))
            {
                await DisplayAlert("Error", "Zone code is missing", "OK");
                return;
            }

            // Update header
            ZoneNameLabel.Text = _zoneName ?? _zoneCode;

            // Load POIs from local database
            await _poiQuery.InitAsync();
            var allPois = await _poiQuery.GetAllAsync();

            // For now, we'll show all POIs (in production, filter by zone)
            _pois.Clear();
            foreach (var poi in allPois)
            {
                var localization = await _poiQuery.GetLocalizationAsync(poi.Code, _language ?? "vi");

                _pois.Add(new PoiListItem
                {
                    Code = poi.Code,
                    Name = localization?.Name ?? poi.Code,
                    Summary = localization?.Summary ?? "",
                    Latitude = poi.Latitude,
                    Longitude = poi.Longitude
                });
            }

            PoiCountLabel.Text = $"{_pois.Count} locations";

            // Check access status
            await CheckAccessStatusAsync();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[ZONE-POIS] Load error: {ex.Message}");
            await DisplayAlert("Error", "Failed to load zone POIs", "OK");
        }
        finally
        {
            LoadingIndicator.IsRunning = false;
            LoadingIndicator.IsVisible = false;
        }
    }

    private async Task CheckAccessStatusAsync()
    {
        try
        {
            if (!_authService.IsAuthenticated)
            {
                // Not logged in - show purchase prompt
                AccessFrame.IsVisible = true;
                AccessMessageLabel.Text = "Login and purchase this zone to unlock all locations";
                PurchaseButton.Text = "Login to Purchase";
                return;
            }

            // Check if user has access to this zone
            using var response = await _apiService.GetAsync($"zones/{_zoneCode}");
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                var zoneData = System.Text.Json.JsonSerializer.Deserialize<ZoneAccessResponse>(json);

                if (zoneData?.Data?.AccessStatus?.HasAccess == true)
                {
                    // User has access - hide purchase frame
                    AccessFrame.IsVisible = false;
                }
                else
                {
                    // User needs to purchase
                    AccessFrame.IsVisible = true;
                    var price = zoneData?.Data?.AccessStatus?.Price ?? 0;
                    AccessMessageLabel.Text = $"Purchase this zone for {price} credits to unlock all locations";
                    PurchaseButton.Text = $"Purchase for {price} credits";
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[ZONE-POIS] Access check error: {ex.Message}");
        }
    }

    private async void OnPoiSelected(object sender, SelectionChangedEventArgs e)
    {
        if (e.CurrentSelection.FirstOrDefault() is PoiListItem selectedPoi)
        {
            // Navigate to POI detail
            var route = $"/poidetail?code={Uri.EscapeDataString(selectedPoi.Code)}&lang={Uri.EscapeDataString(_language ?? "vi")}";
            await Shell.Current.GoToAsync(route);

            // Deselect
            PoisCollectionView.SelectedItem = null;
        }
    }

    private async void OnPurchaseClicked(object sender, EventArgs e)
    {
        try
        {
            if (!_authService.IsAuthenticated)
            {
                // Navigate to login
                await Shell.Current.GoToAsync("//login");
                return;
            }

            var confirm = await DisplayAlert(
                "Purchase Zone",
                $"Do you want to purchase '{_zoneName}' zone?",
                "Yes",
                "No");

            if (!confirm) return;

            LoadingIndicator.IsRunning = true;
            LoadingIndicator.IsVisible = true;

            // Call purchase API
            using var response = await _apiService.PostAsJsonAsync("purchase/zone", new { zoneCode = _zoneCode });

            if (response.IsSuccessStatusCode)
            {
                await DisplayAlert("Success", "Zone purchased successfully!", "OK");
                AccessFrame.IsVisible = false;
            }
            else
            {
                var error = await response.Content.ReadAsStringAsync();
                await DisplayAlert("Error", $"Purchase failed: {error}", "OK");
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[ZONE-POIS] Purchase error: {ex.Message}");
            await DisplayAlert("Error", "Failed to purchase zone", "OK");
        }
        finally
        {
            LoadingIndicator.IsRunning = false;
            LoadingIndicator.IsVisible = false;
        }
    }
}

public class PoiListItem
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Summary { get; set; } = "";
    public double Latitude { get; set; }
    public double Longitude { get; set; }
}

public class ZoneAccessResponse
{
    public bool Success { get; set; }
    public ZoneAccessData? Data { get; set; }
}

public class ZoneAccessData
{
    public ZoneAccessStatus? AccessStatus { get; set; }
}

public class ZoneAccessStatus
{
    public bool HasAccess { get; set; }
    public bool RequiresPurchase { get; set; }
    public int Price { get; set; }
}
