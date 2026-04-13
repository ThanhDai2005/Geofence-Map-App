using System.Diagnostics;
using System.Threading;
using MauiApp1.Models;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Controls;

namespace MauiApp1.Services;

/// <summary>
/// Bridges Android VIEW intents to <see cref="DeepLinkHandler"/> on the MAUI main thread
/// when Shell navigation is safe. Warm/background links are queued via <see cref="PendingDeepLinkStore"/>.
/// </summary>
public sealed class DeepLinkCoordinator
{
    private readonly PendingDeepLinkStore _store;
    private readonly DeepLinkHandler _handler;
    private readonly SemaphoreSlim _dispatchGate = new(1, 1);
    private CancellationTokenSource? _dispatchCts;
    private int _dispatchVersion;

    public DeepLinkCoordinator(PendingDeepLinkStore store, DeepLinkHandler handler)
    {
        _store = store;
        _handler = handler;
    }

    /// <summary>Called from Android MainActivity after storing the pending URI.</summary>
    public void OnAndroidViewIntent(string rawUri, string androidSource, bool isWarm)
    {
        Debug.WriteLine($"[DL-DISPATCH] Received uri={rawUri} source={androidSource} isWarm={isWarm}");

        if (!isWarm)
        {
            Debug.WriteLine("[DL-DISPATCH] Cold / OnCreate link stored only (deferring until Shell is ready)");
            return;
        }

        TriggerDispatch(consumeAny: false);
    }

    /// <summary>Retry consumption after resume if a warm link is still pending.</summary>
    public void OnAppResumed()
    {
        if (_store.HasWarmPendingLink())
        {
            Debug.WriteLine("[DL-DISPATCH] OnAppResumed: warm pending exists, triggering dispatch");
            TriggerDispatch(consumeAny: false);
        }
    }

    /// <summary>Shell finished first layout; helps if intent arrived before Shell was ready.</summary>
    public void OnShellAppeared()
    {
        if (_store.HasPendingLink())
        {
            Debug.WriteLine("[DL-DISPATCH] OnShellAppeared: pending link found, triggering dispatch");
            TriggerDispatch(consumeAny: true);
        }
    }

    private void TriggerDispatch(bool consumeAny)
    {
        lock (this)
        {
            var newVersion = ++_dispatchVersion;
            _dispatchCts?.Cancel();
            _dispatchCts?.Dispose();
            _dispatchCts = new CancellationTokenSource();
            
            _ = RunWarmDispatchAsync(newVersion, _dispatchCts.Token, consumeAny);
        }
    }

    private async Task RunWarmDispatchAsync(int version, CancellationToken ct, bool consumeAny)
    {
        var entered = false;
        try
        {
            // Use a short timeout for the gate to avoid blocking indefinitely if something goes wrong
            if (!await _dispatchGate.WaitAsync(TimeSpan.FromSeconds(10), ct).ConfigureAwait(false))
            {
                Debug.WriteLine("[DL-DISPATCH] Dispatch gate timeout");
                return;
            }
            entered = true;

            if (version != Volatile.Read(ref _dispatchVersion)) return;

            const int maxAttempts = 15;
            for (var attempt = 0; attempt < maxAttempts; attempt++)
            {
                if (ct.IsCancellationRequested || version != Volatile.Read(ref _dispatchVersion))
                    return;

                // Adaptive delay: first attempt is very fast, then slightly longer, then stable
                var delayMs = attempt == 0 ? 50 : (attempt < 5 ? 150 : 300);
                if (attempt > 0)
                    await Task.Delay(delayMs, ct).ConfigureAwait(false);

                var ready = await MainThread.InvokeOnMainThreadAsync(IsShellNavigationReady).ConfigureAwait(false);
                if (!ready)
                {
                    if (attempt % 5 == 0)
                        Debug.WriteLine($"[DL-DISPATCH] Shell not ready (attempt {attempt + 1}/{maxAttempts})");
                    continue;
                }

                var raw = consumeAny ? _store.TakePendingLink() : _store.TakePendingLinkIfWarm();

                if (string.IsNullOrWhiteSpace(raw))
                {
                    Debug.WriteLine("[DL-DISPATCH] Pending link consumed or empty");
                    return;
                }

                Debug.WriteLine($"[DL-DISPATCH] Executing link: {raw}");

                try
                {
                    var result = await _handler.HandleIncomingLinkAsync(raw).ConfigureAwait(false);
                    Debug.WriteLine($"[DL-NAV] Success={result.Success} Error='{result.Error}' uri={raw}");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[DL-ERR] Execution failed: {ex.Message}");
                }

                return;
            }

            Debug.WriteLine("[DL-DISPATCH] Max attempts reached; Shell still not ready");
        }
        catch (OperationCanceledException)
        {
            Debug.WriteLine("[DL-DISPATCH] Operation cancelled (superseded)");
        }
        finally
        {
            if (entered) _dispatchGate.Release();
        }
    }

    private static bool IsShellNavigationReady()
    {
        try
        {
            if (Shell.Current is null)
            {
                Debug.WriteLine("[DL-DISPATCH] Shell.Current is null");
                return false;
            }

            if (Microsoft.Maui.Controls.Application.Current?.Windows is null || Microsoft.Maui.Controls.Application.Current.Windows.Count == 0)
            {
                Debug.WriteLine("[DL-DISPATCH] No application windows yet");
                return false;
            }

            if (Shell.Current.CurrentPage is null)
            {
                Debug.WriteLine("[DL-DISPATCH] Shell.CurrentPage is null");
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DL-ERR] IsShellNavigationReady: {ex}");
            return false;
        }
    }
}
