using MauiApp1.ApplicationContracts.Repositories;

namespace MauiApp1.Services;

public sealed class NoOpAuthRepository : IAuthRepository
{
    public Task<bool> IsAuthenticatedAsync(CancellationToken cancellationToken = default)
        => Task.FromResult(false);

    public Task<string?> GetCurrentUserIdAsync(CancellationToken cancellationToken = default)
        => Task.FromResult<string?>(null);
}
