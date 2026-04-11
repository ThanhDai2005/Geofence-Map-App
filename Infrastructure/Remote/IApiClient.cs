using System.Threading;
using System.Threading.Tasks;

namespace MauiApp1.Infrastructure.Remote;

public interface IApiClient
{
    Task<T?> GetAsync<T>(string endpoint, CancellationToken cancellationToken = default);
    Task<TResponse?> PostAsync<TRequest, TResponse>(string endpoint, TRequest data, CancellationToken cancellationToken = default);
}
