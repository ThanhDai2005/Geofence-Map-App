using MauiApp1.Services;

namespace MauiApp1.Views;

public partial class ExplorePage : ContentPage
{
    private readonly INavigationService _navService;

    public ExplorePage(INavigationService navService)
    {
        InitializeComponent();
        _navService = navService;
    }

    private async void OnOpenMapClicked(object sender, EventArgs e)
    {
        await _navService.NavigateToAsync("//map");
    }
}