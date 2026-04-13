using System.ComponentModel;
using System.Net.Http.Json;
using System.Text.Json;
using MauiApp1.Models.Auth;

namespace MauiApp1.Services;

public sealed class AuthService : INotifyPropertyChanged
{
    public const string StorageKeyToken = "vngo_auth_jwt";
    public const string StorageKeyEmail = "vngo_auth_email";
    public const string StorageKeyRole = "vngo_auth_role";
    public const string StorageKeyPremium = "vngo_auth_premium";
    public const string StorageKeyUserId = "vngo_auth_userid";

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private readonly HttpClient _loginHttpClient;
    private readonly AuthTokenStore _tokenStore;

    private string? _email;
    private string _role = "USER";
    private bool _isPremium;
    private string? _userId;
    private bool _isAuthenticated;

    public AuthService(HttpClient loginHttpClient, AuthTokenStore tokenStore)
    {
        _loginHttpClient = loginHttpClient;
        _tokenStore = tokenStore;
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    public event EventHandler? SessionChanged;

    public bool IsAuthenticated
    {
        get => _isAuthenticated;
        private set
        {
            if (_isAuthenticated == value) return;
            _isAuthenticated = value;
            OnPropertyChanged(nameof(IsAuthenticated));
        }
    }

    public string? Email
    {
        get => _email;
        private set
        {
            if (_email == value) return;
            _email = value;
            OnPropertyChanged(nameof(Email));
        }
    }

    public string Role
    {
        get => _role;
        private set
        {
            if (_role == value) return;
            _role = value;
            OnPropertyChanged(nameof(Role));
            OnPropertyChanged(nameof(IsOwner));
            OnPropertyChanged(nameof(IsAdmin));
        }
    }

    public bool IsPremium
    {
        get => _isPremium;
        private set
        {
            if (_isPremium == value) return;
            _isPremium = value;
            OnPropertyChanged(nameof(IsPremium));
        }
    }

    public string? UserId
    {
        get => _userId;
        private set
        {
            if (_userId == value) return;
            _userId = value;
            OnPropertyChanged(nameof(UserId));
        }
    }

    public bool IsOwner => string.Equals(Role, "OWNER", StringComparison.OrdinalIgnoreCase);
    public bool IsAdmin => string.Equals(Role, "ADMIN", StringComparison.OrdinalIgnoreCase);

    /// <summary>Loads JWT and profile from <see cref="SecureStorage"/>; updates in-memory session if token is still valid.</summary>
    public async Task RestoreSessionAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var token = await SecureStorage.Default.GetAsync(StorageKeyToken).ConfigureAwait(false);
            if (string.IsNullOrEmpty(token) || JwtPayloadHelper.IsExpiredOrInvalid(token))
            {
                await ClearSessionAsync(notify: true).ConfigureAwait(false);
                return;
            }

            var email = await SecureStorage.Default.GetAsync(StorageKeyEmail).ConfigureAwait(false);
            var role = await SecureStorage.Default.GetAsync(StorageKeyRole).ConfigureAwait(false) ?? "USER";
            var userId = await SecureStorage.Default.GetAsync(StorageKeyUserId).ConfigureAwait(false);
            var premiumStr = await SecureStorage.Default.GetAsync(StorageKeyPremium).ConfigureAwait(false);
            var isPremium = string.Equals(premiumStr, "true", StringComparison.OrdinalIgnoreCase);

            ApplySession(token, email, role, isPremium, userId, raiseSessionChanged: true);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AUTH] RestoreSessionAsync: {ex}");
            await ClearSessionAsync(notify: true).ConfigureAwait(false);
        }
    }

    public async Task<(bool ok, string? errorMessage)> LoginAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            return (false, "Nhap email va mat khau.");

        try
        {
            var body = new LoginRequestDto { Email = email.Trim(), Password = password };
            var response = await _loginHttpClient.PostAsJsonAsync("auth/login", body, JsonOptions, cancellationToken).ConfigureAwait(false);

            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                return (false, "Email hoac mat khau khong dung.");

            if (!response.IsSuccessStatusCode)
            {
                var err = await TryReadErrorAsync(response, cancellationToken).ConfigureAwait(false);
                return (false, err ?? $"Dang nhap that bai ({(int)response.StatusCode}).");
            }

            var envelope = await response.Content.ReadFromJsonAsync<LoginApiEnvelope>(JsonOptions, cancellationToken).ConfigureAwait(false);
            var dto = envelope?.Data;
            if (dto?.Token == null || dto.User == null)
                return (false, "Phan hoi may chu khong hop le.");

            await PersistSessionAsync(dto.Token, dto.User, cancellationToken).ConfigureAwait(false);
            ApplySession(dto.Token, dto.User.Email, dto.User.Role ?? "USER", dto.User.IsPremium, dto.User.Id, raiseSessionChanged: true);
            return (true, null);
        }
        catch (HttpRequestException ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AUTH] LoginAsync network: {ex}");
            return (false, "Khong ket noi duoc may chu. Kiem tra mang va dia chi API.");
        }
        catch (TaskCanceledException)
        {
            return (false, "Het thoi gian. Thu lai.");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AUTH] LoginAsync: {ex}");
            return (false, "Loi khong xac dinh.");
        }
    }

    public Task LogoutAsync(CancellationToken cancellationToken = default)
        => ClearSessionAsync(notify: true);

    /// <summary>Updates premium flag from local upgrade flow (demo) and persists to secure storage.</summary>
    public async Task UpdateStoredPremiumAsync(bool isPremium, CancellationToken cancellationToken = default)
    {
        try
        {
            await SecureStorage.Default.SetAsync(StorageKeyPremium, isPremium ? "true" : "false").ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AUTH] UpdateStoredPremiumAsync storage: {ex}");
        }

        if (_isPremium == isPremium)
            return;

        _isPremium = isPremium;
        OnPropertyChanged(nameof(IsPremium));
    }

    /// <summary>Called by <see cref="AuthDelegatingHandler"/> when a protected call returns 401.</summary>
    public Task ForceLogoutFromUnauthorizedAsync()
        => ClearSessionAsync(notify: true);

    private Task ClearSessionAsync(bool notify)
    {
        _tokenStore.SetToken(null);

        try
        {
            SecureStorage.Default.Remove(StorageKeyToken);
            SecureStorage.Default.Remove(StorageKeyEmail);
            SecureStorage.Default.Remove(StorageKeyRole);
            SecureStorage.Default.Remove(StorageKeyPremium);
            SecureStorage.Default.Remove(StorageKeyUserId);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AUTH] Clear storage: {ex}");
        }

        Email = null;
        Role = "USER";
        IsPremium = false;
        UserId = null;
        IsAuthenticated = false;

        if (notify)
            RaiseSessionChanged();

        return Task.CompletedTask;
    }

    private async Task PersistSessionAsync(string token, UserDto user, CancellationToken cancellationToken)
    {
        await SecureStorage.Default.SetAsync(StorageKeyToken, token).ConfigureAwait(false);
        if (!string.IsNullOrEmpty(user.Email))
            await SecureStorage.Default.SetAsync(StorageKeyEmail, user.Email).ConfigureAwait(false);
        await SecureStorage.Default.SetAsync(StorageKeyRole, user.Role ?? "USER").ConfigureAwait(false);
        await SecureStorage.Default.SetAsync(StorageKeyPremium, user.IsPremium ? "true" : "false").ConfigureAwait(false);
        if (!string.IsNullOrEmpty(user.Id))
            await SecureStorage.Default.SetAsync(StorageKeyUserId, user.Id).ConfigureAwait(false);
    }

    private void ApplySession(string token, string? email, string role, bool isPremium, string? userId, bool raiseSessionChanged)
    {
        _tokenStore.SetToken(token);
        Email = email;
        Role = role;
        IsPremium = isPremium;
        UserId = userId;
        IsAuthenticated = true;

        if (raiseSessionChanged)
            RaiseSessionChanged();
    }

    private void RaiseSessionChanged()
    {
        SessionChanged?.Invoke(this, EventArgs.Empty);
        OnPropertyChanged(nameof(IsOwner));
        OnPropertyChanged(nameof(IsAdmin));
    }

    private static async Task<string?> TryReadErrorAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            var text = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(text))
                return null;

            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.TryGetProperty("message", out var msg))
                return msg.GetString();
            if (doc.RootElement.TryGetProperty("error", out var err))
                return err.GetString();
        }
        catch
        {
            // ignore
        }

        return null;
    }

    private void OnPropertyChanged(string name) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
