namespace MauiApp1.Services;

public interface IDeviceIdProvider
{
    Task<string> GetOrCreateDeviceIdAsync(CancellationToken cancellationToken = default);
    Task<string> GetDeviceIdAsync(CancellationToken cancellationToken = default);
}
