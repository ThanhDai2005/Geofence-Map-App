using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using MauiApp1.ApplicationContracts.Repositories;
using MauiApp1.Application.UseCases;
using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using MauiApp1.Services;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Controls;

namespace MauiApp1.ViewModels;

public class PoiDetailViewModel : INotifyPropertyChanged, IQueryAttributable
{
    private readonly GetPoiDetailUseCase _getPoiDetailUseCase;
    private readonly PlayPoiAudioUseCase _playPoiAudioUseCase;
    private readonly ILocalizationService _locService;
    private readonly PoiNarrationService      _narrationService;
    private readonly MapViewModel             _mapVm;
    private readonly IPreferredLanguageService _languagePrefs;
    private readonly INavigationService      _navService;
    private readonly AppState                _appState;
    private readonly IPremiumService         _premiumService;

    public System.Windows.Input.ICommand UpgradeCommand { get; }

    private string? _lastLoadedCode;
    private bool    _languageListenerAttached;
    private CancellationTokenSource? _loadingCts;

    public PoiDetailViewModel(
        GetPoiDetailUseCase getPoiDetailUseCase,
        PlayPoiAudioUseCase playPoiAudioUseCase,
        ILocalizationService locService,
        PoiNarrationService narrationService,
        MapViewModel mapVm,
        IPreferredLanguageService languagePrefs,
        INavigationService navService,
        AppState appState,
        IPremiumService premiumService)
    {
        _getPoiDetailUseCase = getPoiDetailUseCase;
        _playPoiAudioUseCase = playPoiAudioUseCase;
        _locService       = locService;
        _narrationService = narrationService;
        _mapVm            = mapVm;
        _languagePrefs    = languagePrefs;
        _navService       = navService;
        _appState         = appState;
        _premiumService   = premiumService;

        UpgradeCommand = new Command(async () => await UpgradeAsync());
    }

    // ── Language change listener ──────────────────────────────────────────────

    public void AttachPreferredLanguageListener()
    {
        if (_languageListenerAttached) return;
        _languagePrefs.PreferredLanguageChanged += OnPreferredLanguageChanged;
        _languageListenerAttached = true;
    }

    public void DetachPreferredLanguageListener()
    {
        if (!_languageListenerAttached) return;
        _languagePrefs.PreferredLanguageChanged -= OnPreferredLanguageChanged;
        _languageListenerAttached = false;
    }

    private async void OnPreferredLanguageChanged(object? sender, string lang)
    {
        if (string.IsNullOrWhiteSpace(_lastLoadedCode)) return;
        try
        {
            Debug.WriteLine($"[POI-DETAIL] Language changed to '{lang}', reloading code='{_lastLoadedCode}'");
            await LoadPoiAsync(_lastLoadedCode, lang).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[POI-DETAIL] Language reload error: {ex}");
        }
    }

    // ── Bindable properties ───────────────────────────────────────────────────

    private bool _isBusy;
    public bool IsBusy
    {
        get => _isBusy;
        private set { _isBusy = value; OnPropertyChanged(); }
    }

    private Poi? _poi;
    public Poi? Poi
    {
        get => _poi;
        set
        {
            _poi = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(OpenOnMapButtonText));
            OnPropertyChanged(nameof(PlayButtonText));
            OnPropertyChanged(nameof(StopButtonText));
            OnPropertyChanged(nameof(IsPremium));
            OnPropertyChanged(nameof(IsNotPremium));
        }
    }

    public bool IsPremium
    {
        get => _premiumService.IsPremium;
        set
        {
            if (_premiumService.IsPremium != value)
            {
                _premiumService.IsPremium = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsNotPremium));
            }
        }
    }

    public bool IsNotPremium => !IsPremium;

    // ── Shell query attributes ────────────────────────────────────────────────

    // Button UI should follow the current app UI language, not the POI fallback language.
    private string EffectiveLang => _appState.CurrentLanguage;

    public string OpenOnMapButtonText => EffectiveLang switch
    {
        "vi" => "🗺 Mở trên bản đồ",
        "en" => "🗺 Open on Map",
        "zh" => "🗺 在地图上打开",
        "ja" => "🗺 マップで開く",
        _ => "🗺 Open on Map"
    };

    public string PlayButtonText => EffectiveLang switch
    {
        "vi" => "🔊 Phát",
        "en" => "🔊 Play",
        "zh" => "🔊 播放",
        "ja" => "🔊 再生",
        _ => "🔊 Play"
    };

    public string StopButtonText => EffectiveLang switch
    {
        "vi" => "⏹ Dừng",
        "en" => "⏹ Stop",
        "zh" => "⏹ 停止",
        "ja" => "⏹ 停止",
        _ => "⏹ Stop"
    };

    public async void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        try
        {
            if (query.TryGetValue("code", out var cobj) && cobj is string code)
            {
                string? lang = null;
                if (query.TryGetValue("lang", out var lobj) && lobj is string lstr)
                    lang = lstr;

                Debug.WriteLine($"[QR-NAV] PoiDetail ApplyQueryAttributes code='{code}' lang='{lang}'");

                // Cancel any existing loading task
                _loadingCts?.Cancel();
                _loadingCts?.Dispose();
                _loadingCts = new CancellationTokenSource();

                await LoadPoiAsync(code, lang, _loadingCts.Token);
                Debug.WriteLine($"[QR-NAV] PoiDetail ApplyQueryAttributes done Poi null?={Poi == null}");
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            Debug.WriteLine($"[POI-DETAIL] Entry error: {ex}");
        }
    }

    // ── Core load ────────────────────────────────────────────────────────────

    /// <summary>
    /// Loads a POI by code from the database and attaches localization from the
    /// in-memory <see cref="LocalizationService"/> — no PoiTranslationService call.
    /// </summary>
    public async Task LoadPoiAsync(string code, string? lang = null, CancellationToken ct = default)
    {
        if (IsBusy) return;
        IsBusy = true;
        try
        {
            // Initialize the localization lookup if it hasn't been loaded yet.
            await _locService.InitializeAsync().ConfigureAwait(false);
            ct.ThrowIfCancellationRequested();

            _lastLoadedCode  = code.Trim().ToUpperInvariant();
            var effectiveLang = string.IsNullOrWhiteSpace(lang)
                ? _languagePrefs.GetStoredOrDefault()
                : lang.Trim().ToLowerInvariant();

            Debug.WriteLine($"[POI-DETAIL] LoadPoiAsync code='{_lastLoadedCode}' lang='{effectiveLang}'");

            // Fetch core geo data using UseCase
            var core = await _getPoiDetailUseCase.ExecuteAsync(_lastLoadedCode, ct).ConfigureAwait(false);
            ct.ThrowIfCancellationRequested();

            if (core == null)
            {
                Debug.WriteLine($"[POI-DETAIL] No core POI found for code='{_lastLoadedCode}'");
                Poi = null;
                return;
            }

            // Attach localization from in-memory lookup
            var locResult = _locService.GetLocalizationResult(_lastLoadedCode, effectiveLang);
            
            // New Poi instance — ensures MAUI bindings update
            var poi = new Poi
            {
                Id        = core.Id,
                Code      = core.Code,
                Latitude  = core.Latitude,
                Longitude = core.Longitude,
                Radius    = core.Radius,
                Priority  = core.Priority,
                IsFallback = locResult.IsFallback,
                UsedLanguage = locResult.UsedLang,
                RequestedLanguage = locResult.RequestedLang
            };
            poi.Localization = locResult.Localization;
            
            await MainThread.InvokeOnMainThreadAsync(() =>
            {
                Poi = poi;
                // Keep global state and MapViewModel in sync
                _mapVm?.RequestFocusOnPoiCode(code, effectiveLang);
                _appState.SetSelectedPoiByCode(code);
            });

            Debug.WriteLine($"[POI-DETAIL] LoadPoiAsync completed for {_lastLoadedCode}");
        }
        catch (OperationCanceledException) 
        {
            Debug.WriteLine($"[POI-DETAIL] Loading cancelled for {code}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] PoiDetail LoadPoiAsync: {ex}");
        }
        finally
        {
            IsBusy = false;
        }
    }

    // ── Audio ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Plays the standard SHORT narration (FREE).
    /// </summary>
    public async Task PlayAsync()
    {
        if (Poi == null || IsBusy) return;
        IsBusy = true;
        try
        {
            // Stop any existing playback first for audio safety
            _narrationService.Stop();
            
            // Call narration service directly for the short (free) path
            await _narrationService.PlayPoiAsync(Poi);
        }
        finally
        {
            IsBusy = false;
        }
    }

    /// <summary>
    /// Plays the LONG detailed narration. 
    /// Premium users: Full access.
    /// Free users: 5-second preview then upgrade prompt.
    /// </summary>
    public async Task PlayDetailedAsync()
    {
        if (Poi == null || IsBusy) return;
        IsBusy = true;
        try
        {
            // 1. Audio Safety - Stop existing streams
            _narrationService.Stop();

            if (IsPremium)
            {
                // Premium: Play full detailed narration
                await _narrationService.PlayPoiDetailedAsync(Poi);
            }
            else
            {
                // Free: 5-second preview flow
                await _narrationService.PlayPoiDetailedAsync(Poi);
                
                // Allow preview for 5 seconds
                await Task.Delay(5000);

                // Stop after preview if they haven't manually stopped or navigated
                if (!IsPremium)
                {
                    _narrationService.Stop();
                    
                    // Trigger upgrade prompt on main thread
                    await MainThread.InvokeOnMainThreadAsync(async () =>
                    {
                        if (Microsoft.Maui.Controls.Application.Current?.Windows.FirstOrDefault()?.Page is Page page)
                        {
                            bool upgrade = await page.DisplayAlert(
                                "Tính năng Premium", 
                                "Bạn vừa nghe bản dùng thử. Vui lòng nâng cấp Premium để nghe toàn bộ nội dung chi tiết và hấp dẫn hơn!", 
                                "Nâng cấp ngay", 
                                "Để sau");
                            
                            if (upgrade) await UpgradeAsync();
                        }
                    });
                }
            }
        }
        finally
        {
            IsBusy = false;
        }
    }

    public async Task UpgradeAsync()
    {
        IsPremium = true;
        Debug.WriteLine("[PREMIUM] User upgraded to premium state.");
        
        await MainThread.InvokeOnMainThreadAsync(async () =>
        {
            if (Microsoft.Maui.Controls.Application.Current?.Windows.FirstOrDefault()?.Page is Page page)
            {
                await page.DisplayAlert("Chúc mừng!", "Bạn đã mở khóa thành công gói Premium. Giờ đây bạn có thể nghe toàn bộ các bản thuyết minh chi tiết.", "Tuyệt vời");
            }
        });
    }

    public void Stop() => _narrationService.Stop();

    // ── Navigation: open on map ───────────────────────────────────────────────

    public async Task OpenOnMapAsync()
    {
        if (Poi == null || IsBusy)
        {
            Debug.WriteLine("[QR-NAV] OpenOnMapAsync skipped: no Poi or busy");
            return;
        }

        IsBusy = true;
        try
        {
            // Use current preferred language — not Poi.LanguageCode (BUG-5 fix)
            var lang = _languagePrefs.GetStoredOrDefault();
            _mapVm.RequestFocusOnPoiCode(Poi.Code, lang);

            Debug.WriteLine($"[MAP-NAV] OpenOnMapAsync navigating to //map code='{Poi.Code}' lang='{lang}'");
            await _navService.NavigateToAsync("//map");
            Debug.WriteLine("[MAP-NAV] OpenOnMapAsync GoToAsync //map completed");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[QR-ERR] OpenOnMapAsync: {ex}");
        }
        finally
        {
            IsBusy = false;
        }
    }

    // ── INotifyPropertyChanged ────────────────────────────────────────────────

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string name = "")
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
