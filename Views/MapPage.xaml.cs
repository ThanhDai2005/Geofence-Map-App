using MauiApp1.Models;
using MauiApp1.ViewModels;
using Microsoft.Maui.Controls.Maps;
using Microsoft.Maui.Maps;

namespace MauiApp1.Views;

public partial class MapPage : ContentPage
{
    private readonly MapViewModel _vm;
    private PeriodicTimer? _timer;
    private bool _isTracking;
    private bool _poisDrawn;
    private CancellationTokenSource? _cts;
    private readonly Dictionary<Pin, Poi> _pinToPoi = new();

    public MapPage(MapViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    private async void OnPinMarkerClicked(object? sender, PinClickedEventArgs e)
    {
        if (sender is not Pin pin) return;

        if (_pinToPoi.TryGetValue(pin, out var poi))
        {
            Map.MoveToRegion(MapSpan.FromCenterAndRadius(
                pin.Location, Distance.FromMeters(200)));

            await _vm.PlayPoiAsync(poi, "en");

            e.HideInfoWindow = true;
        }
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        _ = OnAppearingAsync();
    }

    private async Task OnAppearingAsync()
    {
        if (_isTracking) return;

        await _vm.LoadPoisAsync();

        _isTracking = true;
        _cts = new CancellationTokenSource();
        _timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        _ = StartTrackingAsync(_cts.Token);
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();
        _isTracking = false;
        _poisDrawn = false;

        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;

        _timer?.Dispose();
        _timer = null;
    }

    private async Task StartTrackingAsync(CancellationToken ct)
    {
        if (_timer == null) return;

        try
        {
            while (_timer != null &&
                   await _timer.WaitForNextTickAsync(ct))
            {
                await _vm.UpdateLocationAsync();
                var location = _vm.CurrentLocation;
                if (location == null) continue;

                var center = new Location(location.Latitude, location.Longitude);
                Map.MoveToRegion(MapSpan.FromCenterAndRadius(center, Distance.FromMeters(200)));

                if (!_poisDrawn)
                {
                    Map.Pins.Clear();
                    Map.MapElements.Clear();
                    _pinToPoi.Clear();

                    foreach (var poi in _vm.Pois)
                    {
                        var pin = new Pin
                        {
                            Label = poi.GetName("en"),
                            Address = poi.GetDescription("en"),
                            Location = new Location(poi.Latitude, poi.Longitude)
                        };

                        pin.MarkerClicked += OnPinMarkerClicked;

                        Map.Pins.Add(pin);
                        _pinToPoi[pin] = poi;

                        Map.MapElements.Add(new Circle
                        {
                            Center = pin.Location,
                            Radius = Distance.FromMeters(poi.Radius)
                        });
                    }

                    _poisDrawn = true;
                }
            }
        }
        catch (OperationCanceledException)
        {
            // bình thường khi rời page
        }
    }
}