using MauiApp1.ApplicationContracts.Services;
using MauiApp1.Models;
using MauiApp1.ViewModels; // for AvailableLanguage, though it should ideally be in a domain or contract space
using System.Collections.Generic;
using System.Linq;

namespace MauiApp1.Application.UseCases;

public class GetAvailableLanguagesUseCase
{
    private readonly ILanguagePackService _packService;

    public GetAvailableLanguagesUseCase(ILanguagePackService packService)
    {
        _packService = packService;
    }

    public List<AvailableLanguage> Execute(string searchQuery, List<AvailableLanguage> allSupportedLanguages)
    {
        // 1. Filter out those already added
        var unaddedLanguages = allSupportedLanguages
            .Where(l => _packService.GetPack(l.Code) == null)
            .ToList();

        // 2. Filter by search query
        var query = searchQuery?.Trim().ToLowerInvariant() ?? "";
        if (string.IsNullOrEmpty(query))
        {
            return unaddedLanguages;
        }

        return unaddedLanguages.Where(l =>
            l.Code.Contains(query) ||
            l.NativeName.ToLowerInvariant().Contains(query) ||
            l.DisplayName.ToLowerInvariant().Contains(query)).ToList();
    }
}
