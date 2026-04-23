namespace MauiApp1.ApplicationContracts.Services;

/// <summary>
/// Audio queue coordination service for preventing audio conflicts at POIs
/// </summary>
public interface IAudioQueueService
{
    /// <summary>
    /// Connect to Socket.IO server for real-time queue coordination
    /// </summary>
    Task ConnectAsync(string token, string deviceId);

    /// <summary>
    /// Disconnect from Socket.IO server
    /// </summary>
    Task DisconnectAsync();

    /// <summary>
    /// Join a POI room to receive queue updates
    /// </summary>
    Task JoinPoiAsync(string poiCode);

    /// <summary>
    /// Leave a POI room
    /// </summary>
    Task LeavePoiAsync(string poiCode);

    /// <summary>
    /// Request audio playback (adds to queue)
    /// </summary>
    Task<AudioQueuePosition?> RequestAudioAsync(string poiCode, string language, string narrationLength);

    /// <summary>
    /// Notify server that audio playback completed
    /// </summary>
    Task CompleteAudioAsync(string poiCode);

    /// <summary>
    /// Cancel audio queue entry
    /// </summary>
    Task CancelAudioAsync(string poiCode);

    /// <summary>
    /// Get current queue status for a POI
    /// </summary>
    Task<AudioQueueStatus?> GetQueueStatusAsync(string poiCode);

    /// <summary>
    /// Event fired when queue status updates
    /// </summary>
    event EventHandler<AudioQueueStatusEventArgs>? QueueStatusUpdated;

    /// <summary>
    /// Event fired when it's user's turn to play audio
    /// </summary>
    event EventHandler<AudioStartEventArgs>? AudioStartRequested;

    /// <summary>
    /// Check if connected to Socket.IO
    /// </summary>
    bool IsConnected { get; }
}

public class AudioQueuePosition
{
    public string Status { get; set; } = "QUEUED";
    public int Position { get; set; }
    public int EstimatedWaitTime { get; set; }
}

public class AudioQueueStatus
{
    public string PoiCode { get; set; } = "";
    public int TotalInQueue { get; set; }
    public CurrentlyPlayingInfo? CurrentlyPlaying { get; set; }
    public List<QueuedUserInfo> QueuedUsers { get; set; } = new();
}

public class CurrentlyPlayingInfo
{
    public string UserId { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public DateTime StartedAt { get; set; }
    public int EstimatedDuration { get; set; }
}

public class QueuedUserInfo
{
    public string UserId { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public int Position { get; set; }
    public int EstimatedWaitTime { get; set; }
}

public class AudioQueueStatusEventArgs : EventArgs
{
    public AudioQueueStatus Status { get; set; }

    public AudioQueueStatusEventArgs(AudioQueueStatus status)
    {
        Status = status;
    }
}

public class AudioStartEventArgs : EventArgs
{
    public string PoiCode { get; set; }
    public string Language { get; set; }
    public string NarrationLength { get; set; }

    public AudioStartEventArgs(string poiCode, string language, string narrationLength)
    {
        PoiCode = poiCode;
        Language = language;
        NarrationLength = narrationLength;
    }
}
