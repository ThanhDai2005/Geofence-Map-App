using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using Android.Util;
using MauiApp1.Services;

namespace MauiApp1
{
    [Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true, LaunchMode = LaunchMode.SingleTop, ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
    [IntentFilter(new[] { Intent.ActionView }, Categories = new[] { Intent.CategoryDefault, Intent.CategoryBrowsable }, DataScheme = "https", DataHost = "thuyetminh.netlify.app", DataPathPrefix = "/poi/")]
    [IntentFilter(new[] { Intent.ActionView }, Categories = new[] { Intent.CategoryDefault, Intent.CategoryBrowsable }, DataScheme = "https", DataHost = "thuyetminh.netlify.app", DataPathPrefix = "/p/")]
    [IntentFilter(new[] { Intent.ActionView }, Categories = new[] { Intent.CategoryDefault, Intent.CategoryBrowsable }, DataScheme = "https", DataHost = "thuyetminh.netlify.app", DataPathPrefix = "/scan")]
    public class MainActivity : MauiAppCompatActivity
    {
        const string Tag = "DLINK";

        protected override void OnCreate(Bundle? savedInstanceState)
        {
            base.OnCreate(savedInstanceState);
            Log.Debug(Tag, $"OnCreate Action={Intent?.Action}, Data={Intent?.DataString}");
            global::System.Diagnostics.Debug.WriteLine($"[DL-ACT] OnCreate action={Intent?.Action} data={Intent?.DataString}");
            HandleIntent(Intent, "OnCreate");
        }

        protected override void OnNewIntent(Intent? intent)
        {
            base.OnNewIntent(intent);
            Log.Debug(Tag, $"OnNewIntent Action={intent?.Action}, Data={intent?.DataString}");
            global::System.Diagnostics.Debug.WriteLine($"[DL-ACT] OnNewIntent action={intent?.Action} data={intent?.DataString}");

            if (intent != null)
            {
                // Android 15+ binding requires ComponentCaller; pass null when not available.
                SetIntent(intent, null);
                global::System.Diagnostics.Debug.WriteLine("[DL-ACT] SetIntent updated with new VIEW intent");
                Log.Debug(Tag, "SetIntent updated with new intent");
            }

            HandleIntent(intent, "OnNewIntent");
        }

        private void HandleIntent(Intent? intent, string source)
        {
            try
            {
                if (intent == null || intent.Action != Intent.ActionView)
                {
                    global::System.Diagnostics.Debug.WriteLine($"[DL-ACT] {source} ignored: null or not ActionView");
                    return;
                }

                var raw = intent.DataString;
                if (string.IsNullOrWhiteSpace(raw))
                {
                    global::System.Diagnostics.Debug.WriteLine($"[DL-ACT] {source} ignored: empty DataString");
                    return;
                }

                if (Application is not MauiApplication mauiApp || mauiApp.Services == null)
                {
                    global::System.Diagnostics.Debug.WriteLine("[DL-ERR] MAUI services unavailable");
                    return;
                }

                var services = mauiApp.Services;
                var pending = services.GetService<PendingDeepLinkStore>();
                var coordinator = services.GetService<DeepLinkCoordinator>();

                if (pending == null)
                {
                    global::System.Diagnostics.Debug.WriteLine("[DL-ERR] PendingDeepLinkStore not registered");
                    return;
                }

                var isWarm = source == "OnNewIntent";
                pending.SetPendingLink(raw, isWarm: isWarm);
                
                global::System.Diagnostics.Debug.WriteLine($"[DL-ACT] {source} queued uri={raw} isWarm={isWarm}");
                
                // Trigger the coordinator to attempt immediate dispatch if warm
                coordinator?.OnAndroidViewIntent(raw, source, isWarm);
            }
            catch (Exception ex)
            {
                global::System.Diagnostics.Debug.WriteLine($"[DL-ERR] HandleIntent ({source}): {ex.Message}");
            }
        }
    }
}
