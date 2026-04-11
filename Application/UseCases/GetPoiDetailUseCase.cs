using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Models;
using System.Threading;
using System.Threading.Tasks;

namespace MauiApp1.Application.UseCases;

public class GetPoiDetailUseCase
{
    private readonly IPoiQueryRepository _poiRepository;

    public GetPoiDetailUseCase(IPoiQueryRepository poiRepository)
    {
        _poiRepository = poiRepository;
    }

    public async Task<Poi?> ExecuteAsync(string poiId, CancellationToken cancellationToken = default)
    {
        // 1. Get POI by id
        var poi = await _poiRepository.GetByIdAsync(poiId, cancellationToken);
        
        // Let's also fallback to Code if Id returns null, for backwards compatibility with ViewModel
        if (poi == null)
            poi = await _poiRepository.GetByCodeAsync(poiId, null, cancellationToken);

        // 2. Return result
        return poi;
    }
}
