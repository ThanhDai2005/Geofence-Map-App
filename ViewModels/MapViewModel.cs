using System.ComponentModel;
using System.Runtime.CompilerServices;
using Microsoft.Maui.Devices.Sensors;
using MauiApp1.Services;
using MauiApp1.Models;

namespace MauiApp1.ViewModels;

public class MapViewModel : INotifyPropertyChanged
{
    private readonly LocationService _locationService;
    private readonly GeofenceService _geofenceService;
    private readonly PoiDatabase _db;
    private readonly AudioService _audioService;

    public MapViewModel(
        LocationService locationService,
        GeofenceService geofenceService,
        PoiDatabase db,
        AudioService audioService)
    {
        _locationService = locationService;
        _geofenceService = geofenceService;
        _db = db;
        _audioService = audioService;
    }

    private Location? _currentLocation;
    public Location? CurrentLocation
    {
        get => _currentLocation;
        private set
        {
            _currentLocation = value;
            OnPropertyChanged();
        }
    }

    // POIs can be loaded from local file, API,... here as a simple list placeholder
    private List<Poi> _pois = new();
    public IReadOnlyList<Poi> Pois => _pois.AsReadOnly();

    public async Task UpdateLocationAsync()
    {
        var loc = await _locationService.GetCurrentLocationAsync();
        if (loc == null) return;

        CurrentLocation = loc;
        await _geofenceService.CheckLocationAsync(loc);
    }


    public void SetPois(IEnumerable<Poi> pois)
    {
        _pois = pois.ToList();
        _geofenceService.UpdatePois(_pois);
        OnPropertyChanged(nameof(Pois));
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));

    public async Task PlayPoiAsync(Poi poi, string lang = "en")
    {
        var text = poi.GetDescription(lang);
        if (string.IsNullOrWhiteSpace(text))
            text = poi.GetName(lang);

        if (!string.IsNullOrWhiteSpace(text))
            await _audioService.SpeakAsync(text);
    }

    public async Task LoadPoisAsync()
    {
        await _db.InitAsync(); // 👈 đảm bảo DB đã init

        var pois = await _db.GetAllAsync();

        if (!pois.Any())
        {
            var seed = new List<Poi>
        {
            new()
            {
                Name = "Dinh Độc Lập",
                Description = "Di tích lịch sử quốc gia đặc biệt",
                Latitude = 10.7769,
                Longitude = 106.6953,
                Radius = 100,
                Priority = 2
            },
            new()
            {
                Name = "Nhà thờ Đức Bà",
                Description = "Biểu tượng kiến trúc Pháp",
                Latitude = 10.7798,
                Longitude = 106.6992,
                Radius = 80,
                Priority = 1
            },
            new() {
                Name="Bưu điện Trung tâm Sài Gòn",
                Description="Công trình kiến trúc Pháp nổi tiếng...",
                Latitude=10.7801, Longitude=106.6992,
                Radius=80, Priority=2
            },
            new() {
                Name="Chợ Bến Thành",
                Description="Khu chợ nổi tiếng bậc nhất TP.HCM...",
                Latitude=10.7725, Longitude=106.6980,
                Radius=120, Priority=3
            },
            new() {
                Name="Phố đi bộ Nguyễn Huệ",
                Description="Tuyến phố trung tâm, sôi động về đêm...",
                Latitude=10.7754, Longitude=106.7030,
                Radius=150, Priority=1
            }
        };

            await _db.InsertManyAsync(seed);

            pois = await _db.GetAllAsync(); // 👈 BẮT BUỘC load lại
        }

        _pois = pois;
        _geofenceService.UpdatePois(_pois);
        OnPropertyChanged(nameof(Pois));
    }
}