using System.Diagnostics;
using System.Text.Json;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Configuration;
using SocketIOClient;

namespace MauiApp1.Services;

/// <summary>
/// Socket.IO-based audio queue coordination service
/// Prevents audio conflicts when multiple users are at the same POI
/// </summary>
public class AudioQueueService : IAudioQueueService
{
    private SocketIOClient.SocketIO? _socket;
    private readonly SemaphoreSlim _connectionLock = new(1, 1);
    private string? _currentPoiCode;

    public bool IsConnected => _socket?.Connected ?? false;

    public event EventHandler<AudioQueueStatusEventArgs>? QueueStatusUpdated;
    public event EventHandler<AudioStartEventArgs>? AudioStartRequested;

    public async Task ConnectAsync(string token, string deviceId)
    {
        await _connectionLock.WaitAsync();
        try
        {
            if (_socket?.Connected == true)
            {
                Debug.WriteLine("[AUDIO-QUEUE] Already connected");
                return;
            }

            var baseUrl = BackendApiConfiguration.BaseUrl.TrimEnd('/');
            var socketUrl = baseUrl.Replace("/api/v1", "");

            Debug.WriteLine($"[AUDIO-QUEUE] Connecting to {socketUrl}");

            _socket = new SocketIOClient.SocketIO(socketUrl, new SocketIOOptions
            {
                Auth = new Dictionary<string, string>
                {
                    ["token"] = token,
                    ["deviceId"] = deviceId
                },
                Reconnection = true,
                ReconnectionAttempts = 5,
                ReconnectionDelay = 2000
            });

            // Register event handlers
            _socket.OnConnected += (sender, e) =>
            {
                Debug.WriteLine("[AUDIO-QUEUE] Connected to Socket.IO");
            };

            _socket.OnDisconnected += (sender, e) =>
            {
                Debug.WriteLine($"[AUDIO-QUEUE] Disconnected: {e}");
            };

            _socket.OnError += (sender, e) =>
            {
                Debug.WriteLine($"[AUDIO-QUEUE] Error: {e}");
            };

            // Queue status updates
            _socket.On("queue-status", response =>
            {
                try
                {
                    var json = response.GetValue<JsonElement>();
                    var status = ParseQueueStatus(json);
                    Debug.WriteLine($"[AUDIO-QUEUE] Queue status: {status.TotalInQueue} users at {status.PoiCode}");
                    QueueStatusUpdated?.Invoke(this, new AudioQueueStatusEventArgs(status));
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[AUDIO-QUEUE] Parse queue-status error: {ex.Message}");
                }
            });

            // Audio queued confirmation
            _socket.On("audio-queued", response =>
            {
                try
                {
                    var json = response.GetValue<JsonElement>();
                    var position = json.GetProperty("position");
                    Debug.WriteLine($"[AUDIO-QUEUE] Audio queued at position {position.GetProperty("position").GetInt32()}");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[AUDIO-QUEUE] Parse audio-queued error: {ex.Message}");
                }
            });

            // Audio start signal
            _socket.On("audio-start", response =>
            {
                try
                {
                    var json = response.GetValue<JsonElement>();
                    var poiCode = json.GetProperty("poiCode").GetString() ?? "";
                    var language = json.GetProperty("language").GetString() ?? "vi";
                    var narrationLength = json.GetProperty("narrationLength").GetString() ?? "short";

                    Debug.WriteLine($"[AUDIO-QUEUE] Audio start signal for {poiCode}");
                    AudioStartRequested?.Invoke(this, new AudioStartEventArgs(poiCode, language, narrationLength));
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[AUDIO-QUEUE] Parse audio-start error: {ex.Message}");
                }
            });

            // Next user notification
            _socket.On("audio-next", response =>
            {
                try
                {
                    var json = response.GetValue<JsonElement>();
                    var userId = json.GetProperty("userId").GetString();
                    var deviceId = json.GetProperty("deviceId").GetString();
                    Debug.WriteLine($"[AUDIO-QUEUE] Next user: {userId} on device {deviceId}");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[AUDIO-QUEUE] Parse audio-next error: {ex.Message}");
                }
            });

            // Error handling
            _socket.On("audio-error", response =>
            {
                try
                {
                    var json = response.GetValue<JsonElement>();
                    var message = json.GetProperty("message").GetString();
                    Debug.WriteLine($"[AUDIO-QUEUE] Server error: {message}");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[AUDIO-QUEUE] Parse audio-error error: {ex.Message}");
                }
            });

            await _socket.ConnectAsync();
            Debug.WriteLine("[AUDIO-QUEUE] Connection established");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-QUEUE] Connect error: {ex.Message}");
            throw;
        }
        finally
        {
            _connectionLock.Release();
        }
    }

    public async Task DisconnectAsync()
    {
        if (_socket == null) return;

        try
        {
            if (_currentPoiCode != null)
            {
                await LeavePoiAsync(_currentPoiCode);
            }

            await _socket.DisconnectAsync();
            _socket.Dispose();
            _socket = null;
            Debug.WriteLine("[AUDIO-QUEUE] Disconnected");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-QUEUE] Disconnect error: {ex.Message}");
        }
    }

    public async Task JoinPoiAsync(string poiCode)
    {
        if (_socket?.Connected != true)
        {
            Debug.WriteLine("[AUDIO-QUEUE] Cannot join POI - not connected");
            return;
        }

        try
        {
            await _socket.EmitAsync("join-poi", new { poiCode });
            _currentPoiCode = poiCode;
            Debug.WriteLine($"[AUDIO-QUEUE] Joined POI room: {poiCode}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-QUEUE] Join POI error: {ex.Message}");
        }
    }

    public async Task LeavePoiAsync(string poiCode)
    {
        if (_socket?.Connected != true) return;

        try
        {
            await _socket.EmitAsync("leave-poi", new { poiCode });
            if (_currentPoiCode == poiCode)
            {
                _currentPoiCode = null;
            }
            Debug.WriteLine($"[AUDIO-QUEUE] Left POI room: {poiCode}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-QUEUE] Leave POI error: {ex.Message}");
        }
    }

    public async Task<AudioQueuePosition?> RequestAudioAsync(string poiCode, string language, string narrationLength)
    {
        if (_socket?.Connected != true)
        {
            Debug.WriteLine("[AUDIO-QUEUE] Cannot request audio - not connected");
            return null;
        }

        try
        {
            await _socket.EmitAsync("request-audio", new
            {
                poiCode,
                language,
                narrationLength
            });
            Debug.WriteLine($"[AUDIO-QUEUE] Requested audio for {poiCode}");
            return new AudioQueuePosition { Status = "QUEUED", Position = 0, EstimatedWaitTime = 0 };
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-QUEUE] Request audio error: {ex.Message}");
            return null;
        }
    }

    public async Task CompleteAudioAsync(string poiCode)
    {
        if (_socket?.Connected != true) return;

        try
        {
            await _socket.EmitAsync("audio-completed", new { poiCode });
            Debug.WriteLine($"[AUDIO-QUEUE] Completed audio for {poiCode}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-QUEUE] Complete audio error: {ex.Message}");
        }
    }

    public async Task CancelAudioAsync(string poiCode)
    {
        if (_socket?.Connected != true) return;

        try
        {
            await _socket.EmitAsync("cancel-audio", new { poiCode });
            Debug.WriteLine($"[AUDIO-QUEUE] Cancelled audio for {poiCode}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[AUDIO-QUEUE] Cancel audio error: {ex.Message}");
        }
    }

    public async Task<AudioQueueStatus?> GetQueueStatusAsync(string poiCode)
    {
        // Status is received via socket events, not direct query
        // This method is for compatibility - real updates come via QueueStatusUpdated event
        return null;
    }

    private AudioQueueStatus ParseQueueStatus(JsonElement json)
    {
        var status = new AudioQueueStatus
        {
            PoiCode = json.GetProperty("poiCode").GetString() ?? "",
            TotalInQueue = json.GetProperty("totalInQueue").GetInt32()
        };

        if (json.TryGetProperty("currentlyPlaying", out var playing) && playing.ValueKind != JsonValueKind.Null)
        {
            status.CurrentlyPlaying = new CurrentlyPlayingInfo
            {
                UserId = playing.GetProperty("userId").GetString() ?? "",
                DeviceId = playing.GetProperty("deviceId").GetString() ?? "",
                StartedAt = playing.GetProperty("startedAt").GetDateTime(),
                EstimatedDuration = playing.GetProperty("estimatedDuration").GetInt32()
            };
        }

        if (json.TryGetProperty("queuedUsers", out var queued) && queued.ValueKind == JsonValueKind.Array)
        {
            foreach (var user in queued.EnumerateArray())
            {
                status.QueuedUsers.Add(new QueuedUserInfo
                {
                    UserId = user.GetProperty("userId").GetString() ?? "",
                    DeviceId = user.GetProperty("deviceId").GetString() ?? "",
                    Position = user.GetProperty("position").GetInt32(),
                    EstimatedWaitTime = user.GetProperty("estimatedWaitTime").GetInt32()
                });
            }
        }

        return status;
    }
}
