using System.Diagnostics;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Services;

namespace MauiApp1.Infrastructure;

/// <summary>
/// Manages Socket.IO connection lifecycle tied to authentication state
/// Connects when user logs in, disconnects when user logs out
/// </summary>
public class AudioQueueConnectionManager
{
    private readonly IAudioQueueService _audioQueue;
    private readonly AuthService _authService;
    private readonly AuthTokenStore _tokenStore;
    private readonly IDeviceIdProvider _deviceIdProvider;

    public AudioQueueConnectionManager(
        IAudioQueueService audioQueue,
        AuthService authService,
        AuthTokenStore tokenStore,
        IDeviceIdProvider deviceIdProvider)
    {
        _audioQueue = audioQueue;
        _authService = authService;
        _tokenStore = tokenStore;
        _deviceIdProvider = deviceIdProvider;

        // Subscribe to auth state changes
        _authService.SessionChanged += OnSessionChanged;
    }

    private async void OnSessionChanged(object? sender, EventArgs e)
    {
        if (_authService.IsAuthenticated)
        {
            await ConnectAsync();
        }
        else
        {
            await DisconnectAsync();
        }
    }

    public async Task ConnectAsync()
    {
        try
        {
            var token = await _tokenStore.GetTokenAsync();
            if (string.IsNullOrEmpty(token))
            {
                Debug.WriteLine("[AUDIO-QUEUE-MGR] No token available, skipping connection");
                return;
            }

            var deviceId = await _deviceIdProvider.GetDeviceIdAsync();
            await _audioQueue.ConnectAsync(token, deviceId);
            Debug.WriteLine("[AUDIO-QUEUE-MGR] Connected to audio queue");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-QUEUE-MGR] Connect error: {ex.Message}");
        }
    }

    public async Task DisconnectAsync()
    {
        try
        {
            await _audioQueue.DisconnectAsync();
            Debug.WriteLine("[AUDIO-QUEUE-MGR] Disconnected from audio queue");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-QUEUE-MGR] Disconnect error: {ex.Message}");
        }
    }
}
