using Microsoft.Maui.Media;

namespace MauiApp1.Services;

public class AudioService
{
    // Khai báo đèn giao thông (chỉ cho phép 1 luồng âm thanh chạy tại 1 thời điểm)
    private readonly SemaphoreSlim _lock = new(1, 1);
    private CancellationTokenSource? _cts;

    public async Task SpeakAsync(string text, string languageCode)
    {
        if (!await _lock.WaitAsync(0))
            return;

        try
        {
            _cts?.Cancel();
            _cts?.Dispose();
            _cts = new CancellationTokenSource();

            var locales = await TextToSpeech.Default.GetLocalesAsync();

            var selectedLocale = locales.FirstOrDefault(l =>
                l.Language.Equals(languageCode, StringComparison.OrdinalIgnoreCase))
                ?? locales.FirstOrDefault(l =>
                    l.Language.StartsWith(languageCode, StringComparison.OrdinalIgnoreCase));

            var options = new SpeechOptions();

            if (selectedLocale != null)
            {
                options.Locale = selectedLocale;
            }

            await TextToSpeech.Default.SpeakAsync(text, options, _cts.Token);
        }
        catch (OperationCanceledException) { }
        finally
        {
            _lock.Release();
        }
    }
}