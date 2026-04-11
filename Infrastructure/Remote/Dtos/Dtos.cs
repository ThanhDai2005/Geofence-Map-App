using System;

namespace MauiApp1.Infrastructure.Remote.Dtos;

public class PoiDto
{
    public string Id { get; set; } = "";
    public string Code { get; set; } = "";
    public double Lat { get; set; }
    public double Lng { get; set; }
    public int Priority { get; set; }
    public double Radius { get; set; }
    
    // We can map these directly to Localization property in Domain Model
    public string LanguageCode { get; set; } = "";
    public string Name { get; set; } = "";
    public string Summary { get; set; } = "";
    public string NarrationShort { get; set; } = "";
    public string NarrationLong { get; set; } = "";
}

public class AuthDto
{
    public string Token { get; set; } = "";
    public string UserId { get; set; } = "";
}

public class SubscriptionDto
{
    public string UserId { get; set; } = "";
    public bool IsPremium { get; set; }
    public DateTime ExpiryDate { get; set; }
}
