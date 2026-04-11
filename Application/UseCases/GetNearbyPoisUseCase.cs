using MauiApp1.ApplicationContracts.Providers;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Models;
using Microsoft.Maui.Devices.Sensors;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MauiApp1.Application.UseCases;

public class GetNearbyPoisUseCase
{
    private readonly IPoiQueryRepository _poiRepository;
    private readonly ILocationProvider _locationProvider;

    public GetNearbyPoisUseCase(
        IPoiQueryRepository poiRepository, 
        ILocationProvider locationProvider)
    {
        _poiRepository = poiRepository;
        _locationProvider = locationProvider;
    }

    public async Task<List<Poi>> ExecuteAsync(CancellationToken cancellationToken = default)
    {
        // 1. Get current location
        var location = await _locationProvider.GetCurrentLocationAsync(cancellationToken);
        if (location == null) return new List<Poi>();

        // 2. Fetch nearby POIs using the improved interface method (e.g. 5000 meters)
        var nearbyPois = await _poiRepository.GetNearbyAsync(
            location.Latitude, 
            location.Longitude, 
            5000, 
            cancellationToken);

        // 3. Return result
        return nearbyPois;
    }
}
