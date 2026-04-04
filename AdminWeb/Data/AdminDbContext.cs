using AdminWeb.Models;
using Microsoft.EntityFrameworkCore;

namespace AdminWeb.Data;

public sealed class AdminDbContext : DbContext
{
    public AdminDbContext(DbContextOptions<AdminDbContext> options) : base(options) { }

    public DbSet<PoiRecord> Pois => Set<PoiRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<PoiRecord>()
            .HasIndex(p => new { p.Code, p.LanguageCode })
            .IsUnique();
    }
}

