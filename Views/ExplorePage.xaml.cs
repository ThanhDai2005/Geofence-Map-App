using MauiApp1.Services;

namespace MauiApp1.Views;

public partial class ExplorePage : ContentPage
{
    private readonly INavigationService _navService;

    public ExplorePage(INavigationService navService, ViewModels.ExploreViewModel viewModel)
    {
        InitializeComponent();
        _navService = navService;
        BindingContext = viewModel;
    }

    private async void OnOpenMapClicked(object sender, EventArgs e)
    {
        await _navService.NavigateToAsync("//map");
    }
}