using System.Diagnostics;

namespace MauiApp1.Services;

/// <summary>
/// Centralized navigation authority. 
/// Serializes all modal push/pop and Shell GoToAsync transitions to prevent 
/// platform-level race conditions and stack crashes.
/// Updates <see cref="AppState.ModalCount"/> for background service awareness.
/// </summary>
public class NavigationService : INavigationService
{
    private readonly AppState _appState;
    private readonly SemaphoreSlim _navGate = new(1, 1);
    private bool _isNavigating;

    public NavigationService(AppState appState)
    {
        _appState = appState;
    }

    public async Task PushModalAsync(Page page, bool animated = true)
    {
        if (page == null) return;

        if (!await StartNavigationAsync("PushModalAsync").ConfigureAwait(false))
            return;

        try
        {
            var nav = Shell.Current.Navigation;
            Debug.WriteLine($"[NAV] Pushing modal: {page.GetType().Name}. Current stack count: {nav.ModalStack.Count}");
            
            await nav.PushModalAsync(page, animated).ConfigureAwait(false);
            
            _appState.ModalCount = nav.ModalStack.Count;
            Debug.WriteLine($"[NAV] Push successful. AppState.ModalCount={_appState.ModalCount}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[NAV-ERR] PushModalAsync failure: {ex.Message}");
        }
        finally
        {
            EndNavigation();
        }
    }

    public async Task PopModalAsync(bool animated = true)
    {
        if (!await StartNavigationAsync("PopModalAsync").ConfigureAwait(false))
            return;

        try
        {
            var nav = Shell.Current.Navigation;
            if (nav.ModalStack.Count == 0)
            {
                Debug.WriteLine("[NAV] PopModalAsync ignored: Modal stack is already empty.");
                _appState.ModalCount = 0;
                return;
            }

            Debug.WriteLine($"[NAV] Popping modal. Current stack count: {nav.ModalStack.Count}");
            await nav.PopModalAsync(animated).ConfigureAwait(false);
            
            _appState.ModalCount = nav.ModalStack.Count;
            Debug.WriteLine($"[NAV] Pop successful. AppState.ModalCount={_appState.ModalCount}");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[NAV-ERR] PopModalAsync failure: {ex.Message}");
        }
        finally
        {
            EndNavigation();
        }
    }

    public Task NavigateToAsync(string route, bool animated = true)
    {
        return NavigateToAsync(route, null, animated);
    }

    public async Task NavigateToAsync(string route, IDictionary<string, object>? parameters, bool animated = true)
    {
        if (string.IsNullOrWhiteSpace(route)) return;

        if (!await StartNavigationAsync($"NavigateToAsync: {route}").ConfigureAwait(false))
            return;

        try
        {
            Debug.WriteLine($"[NAV] Navigating to: {route}");
            await MainThread.InvokeOnMainThreadAsync(async () => 
            {
                if (parameters != null)
                {
                    await Shell.Current.GoToAsync(route, animated, parameters).ConfigureAwait(false);
                }
                else
                {
                    await Shell.Current.GoToAsync(route, animated).ConfigureAwait(false);
                }
            }).ConfigureAwait(false);
            Debug.WriteLine($"[NAV] Navigation to {route} completed.");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[NAV-ERR] NavigateToAsync failure for {route}: {ex.Message}");
        }
        finally
        {
            EndNavigation();
        }
    }

    public async Task GoBackAsync(bool animated = true)
    {
        if (!await StartNavigationAsync("GoBackAsync").ConfigureAwait(false))
            return;

        try
        {
            Debug.WriteLine("[NAV] Navigating back (..)");
            await MainThread.InvokeOnMainThreadAsync(async () => 
            {
                await Shell.Current.GoToAsync("..", animated).ConfigureAwait(false);
            }).ConfigureAwait(false);
            Debug.WriteLine("[NAV] GoBack completed.");
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[NAV-ERR] GoBackAsync failure: {ex.Message}");
        }
        finally
        {
            EndNavigation();
        }
    }

    private async Task<bool> StartNavigationAsync(string context)
    {
        // Thread-safe check of the lock flag
        lock (_navGate)
        {
            if (_isNavigating)
            {
                Debug.WriteLine($"[NAV] Rejection: Already navigating inside: {context}");
                return false;
            }
            _isNavigating = true;
        }

        try
        {
            // Serialize access to Shell navigation to prevent platform-level race conditions
            await _navGate.WaitAsync().ConfigureAwait(false);
            return true;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[NAV-ERR] Semaphore wait failed: {ex.Message}");
            lock (_navGate) { _isNavigating = false; }
            return false;
        }
    }

    private void EndNavigation()
    {
        try
        {
            _navGate.Release();
        }
        finally
        {
            lock (_navGate)
            {
                _isNavigating = false;
            }
        }
    }
}
