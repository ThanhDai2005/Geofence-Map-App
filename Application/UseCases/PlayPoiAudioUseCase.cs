using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.ApplicationContracts.Services;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace MauiApp1.Application.UseCases;

public class PlayPoiAudioUseCase
{
    private readonly IPoiQueryRepository _poiRepository;
    private readonly ISubscriptionRepository _subscriptionRepository;
    private readonly IAudioPlayerService _audioPlayerService;

    public PlayPoiAudioUseCase(
        IPoiQueryRepository poiRepository,
        ISubscriptionRepository subscriptionRepository,
        IAudioPlayerService audioPlayerService)
    {
        _poiRepository = poiRepository;
        _subscriptionRepository = subscriptionRepository;
        _audioPlayerService = audioPlayerService;
    }

    public async Task ExecuteAsync(string poiId, string userId = null, CancellationToken cancellationToken = default)
    {
        // 1. Check if user is premium
        bool isPremium = await _subscriptionRepository.HasActiveSubscriptionAsync(cancellationToken);
        if (!isPremium)
        {
            throw new UnauthorizedAccessException("Cần có gói Premium để nghe âm thanh này.");
        }

        // 2. Get POI
        var poi = await _poiRepository.GetByIdAsync(poiId, cancellationToken);
        if (poi == null)
        {
            poi = await _poiRepository.GetByCodeAsync(poiId, null, cancellationToken); // Fallback for code
            if (poi == null)
                throw new ArgumentException($"POI không tồn tại (ID: {poiId}).");
        }

        // 3. Play audio
        string text = poi.Localization?.NarrationLong 
                      ?? poi.Localization?.NarrationShort 
                      ?? poi.Localization?.Name 
                      ?? string.Empty;

        // Note: For Clean Architecture, the use case orchestrates the interface directly, avoiding UI concerns
        await _audioPlayerService.SpeakAsync(poi.Code, text, poi.UsedLanguage ?? "vi", cancellationToken);
    }
}
