using MauiApp1.Views;
using Microsoft.Extensions.DependencyInjection;

namespace MauiApp1
{
    public partial class App : Application
    {
        public App()
        {
            InitializeComponent();
            MainPage = new AppShell();
        }
    }

}