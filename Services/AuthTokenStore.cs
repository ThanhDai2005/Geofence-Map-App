namespace MauiApp1.Services;

/// <summary>In-memory bearer token for <see cref="AuthDelegatingHandler"/> (also persisted via <see cref="AuthService"/>).</summary>
public sealed class AuthTokenStore
{
    private readonly object _lock = new();
    private string? _token;

    public string? Token
    {
        get
        {
            lock (_lock)
                return _token;
        }
    }

    public void SetToken(string? token)
    {
        lock (_lock)
            _token = string.IsNullOrWhiteSpace(token) ? null : token;
    }

    public Task<string?> GetTokenAsync()
    {
        lock (_lock)
            return Task.FromResult(_token);
    }
}
