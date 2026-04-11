namespace MauiApp1.ApplicationContracts.Repositories;

/// <summary>Future subscription / entitlement checks (store or backend).</summary>
public interface ISubscriptionRepository
{
    Task<bool> HasActiveSubscriptionAsync(CancellationToken cancellationToken = default);
}
