using MauiApp1.ApplicationContracts.Repositories;

namespace MauiApp1.Services;

public sealed class NoOpSubscriptionRepository : ISubscriptionRepository
{
    public Task<bool> HasActiveSubscriptionAsync(CancellationToken cancellationToken = default)
        => Task.FromResult(true);
}
