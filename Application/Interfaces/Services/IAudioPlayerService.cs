namespace MauiApp1.ApplicationContracts.Services;

/// <summary>Text-to-speech playback (platform).</summary>
public interface IAudioPlayerService
{
    Task SpeakAsync(string poiCode, string text, string languageCode, CancellationToken cancellationToken = default);

    Task StopAsync(CancellationToken cancellationToken = default);
}
