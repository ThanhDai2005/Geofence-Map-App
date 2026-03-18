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
    private Pin? _userPin;

    public MapPage(MapViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;

        BottomPanel.Opacity = 0; // ✅ QUAN TRỌNG
    }

    // Sự kiện 1: Khi bấm vào Cây ghim đỏ trên bản đồ
    private async void OnPinMarkerClicked(object? sender, PinClickedEventArgs e)
    {
        if (sender is not Pin pin) return;

        if (_pinToPoi.TryGetValue(pin, out var poi))
        {
            Map.MoveToRegion(
                MapSpan.FromCenterAndRadius(pin.Location, Distance.FromMeters(200)));

            // 2. Chặn không cho hiện cái bong bóng mặc định cũ nữa
            e.HideInfoWindow = true;

            // 3. Báo cho ViewModel biết điểm nào đang được chọn để bật Bảng thông tin (Bottom Panel) lên
            if (!BottomPanel.IsVisible)
            {
                BottomPanel.TranslationY = 300;
                BottomPanel.Opacity = 0;
            }

            _vm.SelectedPoi = poi;

            BottomPanel.IsVisible = true; // ✅ bật trước

            await BottomPanel.TranslateToAsync(0, 0, 250, Easing.CubicOut);
            await BottomPanel.FadeToAsync(1, 200);

            // 4. Vẫn đọc bài ngắn giới thiệu khi vừa bấm
            await _vm.PlayPoiAsync(poi, _vm.CurrentLanguage);
        }
    }

    // --- 2 HÀM MỚI CHO BẢNG THÔNG TIN ---
    // Khi bấm nút "Nghe chi tiết" màu xanh
    private async void OnListenDetailedClicked(object sender, EventArgs e)
    {
        if (_vm.SelectedPoi != null)
        {
            await _vm.PlayPoiDetailedAsync(_vm.SelectedPoi, _vm.CurrentLanguage);
        }
    }

    // Khi bấm nút "Đóng"
    private async void OnClosePanelClicked(object sender, EventArgs e)
    {
        await BottomPanel.TranslateToAsync(0, 300, 200, Easing.CubicIn);
        await BottomPanel.FadeToAsync(0, 150);

        BottomPanel.IsVisible = false; // ✅ tắt sau animation
        _vm.SelectedPoi = null;
    }
    // ------------------------------------

    protected override void OnAppearing()
    {
        base.OnAppearing();

        if (BottomPanel != null)
        {
            BottomPanel.TranslationY = 300; // ẩn dưới màn hình
        }

        _ = OnAppearingAsync();
    }

    private async Task OnAppearingAsync()
    {
        try
        {
            if (_isTracking) return;

            await _vm.LoadPoisAsync();

            _isTracking = true;
            _cts = new CancellationTokenSource();
            _timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
            _ = StartTrackingAsync(_cts.Token);
        }
        catch (Exception ex)
        {
            await DisplayAlertAsync("Error", ex.Message, "OK");
        }
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

    private void OnVietnameseClicked(object sender, EventArgs e)
    {
        _vm.SetLanguage("vi");
        ReloadLanguage();
    }

    private void OnEnglishClicked(object sender, EventArgs e)
    {
        _vm.SetLanguage("en");
        ReloadLanguage();
    }

    private async void ReloadLanguage()
    {
        _vm.SelectedPoi = null;
        _poisDrawn = false;
        _userPin = null;

        await _vm.LoadPoisAsync(_vm.CurrentLanguage);

        // delay nhẹ để UI update xong
        await Task.Delay(50);

        DrawPois();
    }

    private void DrawUserLocation(Location location)
    {
        if (_userPin == null)
        {
            _userPin = new Pin
            {
                Label = _vm.CurrentLanguage == "en" ? "You are here" : "Bạn đang ở đây",
                Location = location,
                Type = PinType.Generic
            };

            Map.Pins.Add(_userPin);
        }
        else
        {
            _userPin.Location = location;
        }
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
                DrawUserLocation(center);

                if (!_poisDrawn)
                {
                    DrawPois();

                    Map.MoveToRegion(
                        MapSpan.FromCenterAndRadius(center, Distance.FromMeters(500)));

                    _poisDrawn = true;
                }
            }
        }
        catch (OperationCanceledException)
        {
            // bình thường khi rời page
        }
    }

    private void DrawPois()
    {
        Map.Pins.Clear();
        Map.MapElements.Clear();
        _pinToPoi.Clear();

        // ❗ add lại user pin trước
        if (_userPin != null)
        {
            Map.Pins.Add(_userPin);
        }

        foreach (var poi in _vm.Pois)
        {
            var pin = new Pin
            {
                Label = poi.GetName(_vm.CurrentLanguage),
                Address = poi.GetDescription(_vm.CurrentLanguage),
                Location = new Location(poi.Latitude, poi.Longitude),
                Type = PinType.Place
            };

            pin.MarkerClicked += OnPinMarkerClicked;

            Map.Pins.Add(pin);
            _pinToPoi[pin] = poi;

            Map.MapElements.Add(new Circle
            {
                Center = pin.Location,
                Radius = Distance.FromMeters(poi.Radius),
                StrokeColor = Colors.Blue,
                FillColor = Colors.LightBlue.WithAlpha(0.3f),
                StrokeWidth = 2
            });
        }
    }
}