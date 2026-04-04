using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();

builder.Services.AddDbContext<AdminWeb.Data.AdminDbContext>(options =>
{
    var dbPath = Path.Combine(builder.Environment.ContentRootPath, "App_Data", "pois-admin.db");
    Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);
    options.UseSqlite($"Data Source={dbPath}");
});

builder.Services.AddSingleton<AdminWeb.Services.PoiJsonSyncService>();

var app = builder.Build();

// Ensure DB exists + initial import from MAUI pois.json (one-time seed on empty db)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AdminWeb.Data.AdminDbContext>();
    await db.Database.EnsureCreatedAsync();

    if (!await db.Pois.AnyAsync())
    {
        var sync = scope.ServiceProvider.GetRequiredService<AdminWeb.Services.PoiJsonSyncService>();
        var sourceJson = Path.Combine(app.Environment.ContentRootPath, "..", "Resources", "Raw", "pois.json");
        await sync.ImportFromJsonAsync(db, sourceJson);
    }
}

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();

app.UseAuthorization();

app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();


app.Run();
