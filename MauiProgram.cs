using MauiApp1.Services;
using MauiApp1.Views;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Maui.Controls.Hosting;
using Microsoft.Maui.Controls.Maps;

namespace MauiApp1
{
    public static class MauiProgram
    {
        public static MauiApp CreateMauiApp()
        {
            SQLitePCL.Batteries_V2.Init();
            var builder = MauiApp.CreateBuilder();
            builder
                .UseMauiApp<App>()
                .UseMauiMaps() // THÊM DÒNG NÀY để dùng Maps
                .ConfigureFonts(fonts =>
                {
                    fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
                    fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
                });

#if DEBUG
            builder.Logging.AddDebug();
#endif

            // Register app services and viewmodels for DI
            builder.Services.AddSingleton<PoiDatabase>();
            builder.Services.AddSingleton<Services.LocationService>();
            builder.Services.AddSingleton<Services.AudioService>();
            builder.Services.AddSingleton<Services.GeofenceService>();
            builder.Services.AddSingleton<ViewModels.MapViewModel>();
            builder.Services.AddTransient<ExplorePage>();
            builder.Services.AddTransient<AboutPage>();
            builder.Services.AddTransient<MapPage>();

            var app = builder.Build();


            return app;
        }
    }
}