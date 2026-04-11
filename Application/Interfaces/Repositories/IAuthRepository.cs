namespace MauiApp1.ApplicationContracts.Repositories;

/// <summary>Future authentication / identity persistence (API or local).</summary>
public interface IAuthRepository
{
    Task<bool> IsAuthenticatedAsync(CancellationToken cancellationToken = default);

    Task<string?> GetCurrentUserIdAsync(CancellationToken cancellationToken = default);
}
