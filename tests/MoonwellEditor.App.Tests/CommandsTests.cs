using System.Text.Json;
using MoonwellEditor.App;

namespace MoonwellEditor.App.Tests;

public sealed class CommandsTests : IDisposable
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "MoonwellEditor.App.Tests", Guid.NewGuid().ToString("N"));

    private readonly List<Home> _homes = [];

    public void Dispose()
    {
        // A watcher holds its folder, so the homes go first.
        foreach (var home in _homes)
        {
            home.Dispose();
        }

        if (Directory.Exists(_folder))
        {
            Directory.Delete(_folder, true);
        }
    }

    private static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement;

    private static async Task<JsonElement> Ask(Commands commands, string command, object? args = null)
    {
        var bridge = new Bridge(commands.Run);
        var request = JsonSerializer.Serialize(new { id = 1, command, args = args ?? new { } });
        return Parse(await bridge.Handle(request));
    }

    // The home folder, with a settings.json that names the game folder when one is given.
    private Home HomeWith(string? gameFolder = null)
    {
        if (gameFolder != null)
        {
            Directory.CreateDirectory(_folder);
            File.WriteAllText(
                Path.Combine(_folder, "settings.json"),
                JsonSerializer.Serialize(new Dictionary<string, string?> { ["game.folder"] = gameFolder }));
        }

        var home = new Home(_folder);
        _homes.Add(home);
        return home;
    }

    private Commands Make(
        Func<string, MoonwellEditor.GameData.GameData> load,
        Func<string?>? ask = null,
        string? savedFolder = null,
        Action<string>? open = null) =>
        new(HomeWith(savedFolder), _ => ask == null ? null : ask(), load, open: open);

    [Fact]
    public async Task Without_a_chosen_folder_the_install_found_is_loaded()
    {
        string? loaded = null;
        var commands = new Commands(
            HomeWith(),
            _ => null,
            folder =>
            {
                loaded = folder;
                throw new IOException("stop here");
            },
            findGame: () => @"C:\Games\Warcraft III");

        await commands.StartLoading();

        Assert.Equal(@"C:\Games\Warcraft III", loaded);
        Assert.Null(new Home(_folder).GameFolder);
    }

    [Fact]
    public async Task A_chosen_folder_comes_before_the_install_found()
    {
        string? loaded = null;
        var commands = new Commands(
            HomeWith(@"C:\Chosen"),
            _ => null,
            folder =>
            {
                loaded = folder;
                throw new IOException("stop here");
            },
            findGame: () => @"C:\Games\Warcraft III");

        await commands.StartLoading();

        Assert.Equal(@"C:\Chosen", loaded);
    }

    [Fact]
    public async Task Without_a_chosen_folder_or_an_install_the_page_asks_for_one()
    {
        var commands = new Commands(
            HomeWith(),
            _ => null,
            _ => throw new InvalidOperationException("must not load"),
            findGame: () => null);

        await commands.StartLoading();
        var state = await Ask(commands, "gameData");

        Assert.Equal(JsonValueKind.Null, state.GetProperty("result").GetProperty("source").ValueKind);
        Assert.Equal("gameDataMissing", Assert.Throws<CommandException>(() => commands.NeedGameData()).Code);
    }

    [Fact]
    public async Task Choosing_the_install_loads_it_with_its_game_version()
    {
        var install = Moonwell.GameData.GameInstall.Find();
        if (install == null)
        {
            Console.WriteLine("No Warcraft III install found; skipped");
            return;
        }

        var cache = Path.Combine(_folder, "cache");
        var commands = Make(path => MoonwellEditor.GameData.GameData.Load(path, cache), () => install);

        await Ask(commands, "chooseGameData");
        await commands.Loading;
        var after = (await Ask(commands, "gameData")).GetProperty("result");

        Assert.True(after.GetProperty("loaded").GetBoolean());
        Assert.Equal(Moonwell.GameData.GameInstall.Build(install).Version, after.GetProperty("game").GetString());
        Assert.False(File.Exists(Path.Combine(_folder, "settings.json")));   // the page writes game.folder, not the app
        Assert.Null(new Home(_folder).GameFolder);
    }

    [Fact]
    public async Task Command_exception_keeps_its_code()
    {
        var bridge = new Bridge((command, args) => throw new CommandException("gameDataMissing", "no folder"));

        var reply = Parse(await bridge.Handle("""{"id":1,"command":"x","args":{}}"""));

        Assert.False(reply.GetProperty("ok").GetBoolean());
        Assert.Equal("gameDataMissing", reply.GetProperty("error").GetProperty("code").GetString());
        Assert.Equal("no folder", reply.GetProperty("error").GetProperty("message").GetString());
    }

    [Fact]
    public async Task The_startup_map_is_given_once_then_cleared()
    {
        var commands = new Commands(
            HomeWith(),
            _ => null,
            _ => throw new InvalidOperationException("must not load"),
            @"C:\Maps\Arena");

        var first = await Ask(commands, "startup");
        var second = await Ask(commands, "startup");

        Assert.Equal(@"C:\Maps\Arena", first.GetProperty("result").GetProperty("map").GetString());
        Assert.Equal(JsonValueKind.Null, second.GetProperty("result").GetProperty("map").ValueKind);
    }

    [Fact]
    public async Task With_no_startup_map_startup_gives_none()
    {
        var commands = Make(_ => throw new InvalidOperationException("must not load"));

        var reply = await Ask(commands, "startup");

        Assert.Equal(JsonValueKind.Null, reply.GetProperty("result").GetProperty("map").ValueKind);
    }

    [Fact]
    public async Task With_reopening_on_the_last_map_is_the_startup_map_once()
    {
        var map = Directory.CreateDirectory(Path.Combine(_folder, "maps", "Arena")).FullName;
        var home = HomeWith();
        home.RememberMap(map);
        File.WriteAllText(Path.Combine(_folder, "settings.json"), """{ "editor.reopenLastMap": true }""");
        var commands = new Commands(home, _ => null, _ => throw new InvalidOperationException("must not load"));

        var first = await Ask(commands, "startup");
        var second = await Ask(commands, "startup");

        Assert.Equal(map, first.GetProperty("result").GetProperty("map").GetString());
        Assert.Equal(JsonValueKind.Null, second.GetProperty("result").GetProperty("map").ValueKind);
    }

    [Fact]
    public async Task Without_reopening_the_last_map_waits_on_the_welcome_screen()
    {
        var home = HomeWith();
        home.RememberMap(Directory.CreateDirectory(Path.Combine(_folder, "maps", "Arena")).FullName);
        var commands = new Commands(home, _ => null, _ => throw new InvalidOperationException("must not load"));

        var reply = await Ask(commands, "startup");

        Assert.Equal(JsonValueKind.Null, reply.GetProperty("result").GetProperty("map").ValueKind);
    }

    [Fact]
    public async Task A_last_map_that_is_gone_is_not_reopened()
    {
        var home = HomeWith();
        home.RememberMap(Path.Combine(_folder, "maps", "Gone"));
        File.WriteAllText(Path.Combine(_folder, "settings.json"), """{ "editor.reopenLastMap": true }""");
        var commands = new Commands(home, _ => null, _ => throw new InvalidOperationException("must not load"));

        var reply = await Ask(commands, "startup");

        Assert.Equal(JsonValueKind.Null, reply.GetProperty("result").GetProperty("map").ValueKind);
    }

    [Fact]
    public async Task The_map_the_app_was_started_with_comes_before_the_last_map()
    {
        var home = HomeWith();
        home.RememberMap(Directory.CreateDirectory(Path.Combine(_folder, "maps", "Arena")).FullName);
        File.WriteAllText(Path.Combine(_folder, "settings.json"), """{ "editor.reopenLastMap": true }""");
        var commands = new Commands(
            home,
            _ => null,
            _ => throw new InvalidOperationException("must not load"),
            @"C:\Maps\Other");

        var reply = await Ask(commands, "startup");

        Assert.Equal(@"C:\Maps\Other", reply.GetProperty("result").GetProperty("map").GetString());
    }

    [Fact]
    public async Task recentMaps_lists_the_kept_maps_and_whether_each_is_there()
    {
        var folder = Directory.CreateDirectory(Path.Combine(_folder, "maps", "Arena")).FullName;
        var archive = Path.Combine(_folder, "maps", "Troll Valley.w3x");
        File.WriteAllText(archive, "");
        var gone = Path.Combine(_folder, "maps", "Gone");
        var home = HomeWith();
        home.RememberMap(gone);
        home.RememberMap(archive);
        home.RememberMap(folder);
        var commands = new Commands(home, _ => null, _ => throw new InvalidOperationException("must not load"));

        var maps = (await Ask(commands, "recentMaps")).GetProperty("result").EnumerateArray().ToList();

        Assert.Equal([folder, archive, gone], maps.Select(map => map.GetProperty("path").GetString()));
        Assert.Equal([true, true, false], maps.Select(map => map.GetProperty("found").GetBoolean()));
    }

    [Fact]
    public async Task forgetMap_takes_a_map_off_the_list_and_gives_the_rest()
    {
        var home = HomeWith();
        home.RememberMap(@"C:\Maps\a");
        home.RememberMap(@"C:\Maps\b");
        var commands = new Commands(home, _ => null, _ => throw new InvalidOperationException("must not load"));

        var reply = await Ask(commands, "forgetMap", new { path = @"C:\Maps\b" });
        var noPath = await Ask(commands, "forgetMap", new { });

        Assert.Equal(
            [@"C:\Maps\a"],
            reply.GetProperty("result").EnumerateArray().Select(map => map.GetProperty("path").GetString()));
        Assert.Equal([@"C:\Maps\a"], new Home(_folder).RecentMaps);
        Assert.Equal("badRequest", noPath.GetProperty("error").GetProperty("code").GetString());
    }

    [Fact]
    public async Task About_gives_the_editor_s_version_as_three_numbers()
    {
        var commands = Make(_ => throw new InvalidOperationException("must not load"));

        var result = (await Ask(commands, "about")).GetProperty("result");

        Assert.Matches(@"^\d+\.\d+\.\d+$", result.GetProperty("version").GetString());
        Assert.Matches(@"^\d+\.\d+\.\d+$", result.GetProperty("moonwell").GetString());
        Assert.False(string.IsNullOrEmpty(result.GetProperty("dotNet").GetString()));
    }

    [Fact]
    public async Task Game_data_with_no_setting_is_missing()
    {
        var commands = Make(_ => throw new InvalidOperationException("must not load"));
        await commands.StartLoading();

        var reply = await Ask(commands, "gameData");

        var result = reply.GetProperty("result");
        Assert.Equal(JsonValueKind.Null, result.GetProperty("source").ValueKind);
        Assert.False(result.GetProperty("loaded").GetBoolean());
        Assert.Equal(JsonValueKind.Null, result.GetProperty("error").ValueKind);
        Assert.Equal("gameDataMissing", Assert.Throws<CommandException>(() => commands.NeedGameData()).Code);
    }

    [Fact]
    public async Task Game_data_is_loading_until_the_background_load_ends()
    {
        var release = new ManualResetEventSlim();
        var commands = Make(_ =>
        {
            release.Wait();
            throw new InvalidOperationException("stop here");
        }, savedFolder: _folder);

        var loading = commands.StartLoading();
        var reply = await Ask(commands, "gameData");

        var result = reply.GetProperty("result");
        Assert.Equal(_folder, result.GetProperty("source").GetString());
        Assert.False(result.GetProperty("loaded").GetBoolean());
        Assert.Equal(JsonValueKind.Null, result.GetProperty("error").ValueKind);
        Assert.Equal("gameDataLoading", Assert.Throws<CommandException>(() => commands.NeedGameData()).Code);

        release.Set();
        await loading;
    }

    [Fact]
    public async Task A_failed_load_is_reported_in_the_state()
    {
        var commands = Make(_ => throw new DirectoryNotFoundException("no such folder"), savedFolder: _folder);

        await commands.StartLoading();
        var reply = await Ask(commands, "gameData");

        var result = reply.GetProperty("result");
        Assert.False(result.GetProperty("loaded").GetBoolean());
        Assert.Equal("no such folder", result.GetProperty("error").GetString());
        Assert.Equal("gameDataFailed", Assert.Throws<CommandException>(() => commands.NeedGameData()).Code);
    }

    [Fact]
    public async Task Choosing_a_folder_that_fails_keeps_the_old_setting()
    {
        var commands = Make(_ => throw new DirectoryNotFoundException("bad"), () => @"C:\bad", savedFolder: @"C:\old");

        await Ask(commands, "chooseGameData");
        await commands.Loading;

        Assert.Equal(@"C:\old", new Home(_folder).GameFolder);
    }

    [Fact]
    public async Task Cancelling_the_dialog_changes_nothing()
    {
        var commands = Make(_ => throw new InvalidOperationException("must not load"), () => null);

        var reply = await Ask(commands, "chooseGameData");

        Assert.True(reply.GetProperty("ok").GetBoolean());
        Assert.Equal(JsonValueKind.Null, reply.GetProperty("result").GetProperty("source").ValueKind);
        Assert.False(File.Exists(Path.Combine(_folder, "settings.json")));
    }

    [Fact]
    public async Task A_newer_state_has_a_higher_version()
    {
        var release = new ManualResetEventSlim();
        var commands = Make(_ =>
        {
            release.Wait();
            throw new InvalidOperationException("stop here");
        }, savedFolder: _folder);
        GameDataState? fromEvent = null;
        commands.GameDataChanged += state => fromEvent = state;

        var loading = commands.StartLoading();
        var whileLoading = (await Ask(commands, "gameData")).GetProperty("result").GetProperty("version").GetInt32();
        release.Set();
        await loading;
        var after = (await Ask(commands, "gameData")).GetProperty("result").GetProperty("version").GetInt32();

        Assert.NotNull(fromEvent);
        Assert.True(fromEvent.Version > whileLoading);
        Assert.Equal(fromEvent.Version, after);
    }

    [Fact]
    public async Task Ping_still_works()
    {
        var commands = Make(_ => throw new InvalidOperationException());

        var reply = await Ask(commands, "ping");

        Assert.Equal("pong", reply.GetProperty("result").GetString());
    }

    [Fact]
    public async Task The_page_answers_a_close_through_two_commands()
    {
        var commands = Make(_ => throw new InvalidOperationException());
        var heard = new List<string>();
        commands.CloseAsking += () => heard.Add("asking");
        commands.CloseApproved += () => heard.Add("approved");

        var asking = await Ask(commands, "closeAsking");
        var approved = await Ask(commands, "closeWindow");

        Assert.True(asking.GetProperty("ok").GetBoolean());
        Assert.True(approved.GetProperty("ok").GetBoolean());
        Assert.Equal(["asking", "approved"], heard);
    }

    [Fact]
    public async Task The_title_bar_drives_the_window_through_commands()
    {
        var commands = Make(_ => throw new InvalidOperationException());
        var heard = new List<string>();
        commands.MinimizeAsked += () => heard.Add("minimize");
        commands.MaximizeAsked += () => heard.Add("maximize");
        commands.CloseClicked += () => heard.Add("close");
        commands.FrameColorsChanged += (surface, border) => heard.Add($"{surface} {border}");
        commands.UiScaleChanged += percent => heard.Add($"{percent}%");
        commands.Maximized = () => true;
        var bridge = new Bridge(commands.Run);

        await Ask(commands, "minimizeWindow");
        await Ask(commands, "maximizeWindow");
        await Ask(commands, "closeClicked");
        var state = await Ask(commands, "windowState");
        var colors = Parse(await bridge.Handle(
            "{\"id\":1,\"command\":\"frameColors\",\"args\":{\"surface\":\"#1f1f28\",\"border\":\"#363646\"}}"));
        var scaled = Parse(await bridge.Handle("{\"id\":1,\"command\":\"uiScale\",\"args\":{\"percent\":120}}"));
        var badScale = Parse(await bridge.Handle("{\"id\":1,\"command\":\"uiScale\",\"args\":{\"percent\":133}}"));
        var bad = Parse(await bridge.Handle(
            "{\"id\":1,\"command\":\"frameColors\",\"args\":{\"surface\":\"red\",\"border\":\"#363646\"}}"));

        Assert.Equal(["minimize", "maximize", "close", "#1f1f28 #363646", "120%"], heard);
        Assert.True(scaled.GetProperty("ok").GetBoolean());
        Assert.False(badScale.GetProperty("ok").GetBoolean());
        Assert.True(state.GetProperty("result").GetProperty("maximized").GetBoolean());
        Assert.True(colors.GetProperty("ok").GetBoolean());
        Assert.False(bad.GetProperty("ok").GetBoolean());
    }

    [Fact]
    public void With_no_map_nothing_is_unsaved()
    {
        var commands = Make(_ => throw new InvalidOperationException());

        Assert.False(commands.Dirty);
    }

    [Fact]
    public async Task writeHome_writes_a_file_in_the_home_folder()
    {
        var commands = Make(_ => throw new InvalidOperationException());

        var reply = await Ask(commands, "writeHome", new { file = "themes/mine.json", text = "{ \"name\": \"Mine\" }" });
        var empty = await Ask(commands, "writeHome", new { file = "hotkeys.json", text = "" });

        Assert.True(reply.GetProperty("ok").GetBoolean());
        Assert.True(empty.GetProperty("ok").GetBoolean());
        Assert.Equal("{ \"name\": \"Mine\" }", File.ReadAllText(Path.Combine(_folder, "themes", "mine.json")));
        Assert.Equal("", File.ReadAllText(Path.Combine(_folder, "hotkeys.json")));
    }

    [Theory]
    [InlineData("../x.json")]
    [InlineData("state.json")]
    [InlineData("themes/a/b.json")]
    public async Task writeHome_refuses_a_name_it_may_not_write(string file)
    {
        var commands = Make(_ => throw new InvalidOperationException());

        var reply = await Ask(commands, "writeHome", new { file, text = "{}" });

        Assert.False(reply.GetProperty("ok").GetBoolean());
        Assert.Equal("badRequest", reply.GetProperty("error").GetProperty("code").GetString());
        Assert.Contains(file, reply.GetProperty("error").GetProperty("message").GetString());
        Assert.DoesNotContain("Parameter", reply.GetProperty("error").GetProperty("message").GetString());
        Assert.False(File.Exists(Path.Combine(_folder, "..", "x.json")));
        Assert.False(File.Exists(Path.Combine(_folder, "state.json")));
    }

    [Fact]
    public async Task writeHome_needs_a_file_and_a_text()
    {
        var commands = Make(_ => throw new InvalidOperationException());

        var noText = await Ask(commands, "writeHome", new { file = "settings.json" });
        var noFile = await Ask(commands, "writeHome", new { text = "{}" });

        Assert.Equal("badRequest", noText.GetProperty("error").GetProperty("code").GetString());
        Assert.Equal("badRequest", noFile.GetProperty("error").GetProperty("code").GetString());
    }

    [Fact]
    public async Task setState_merges_into_state_json()
    {
        var commands = Make(_ => throw new InvalidOperationException());

        var first = await Ask(commands, "setState", new { key = "terminalHeight", value = 300 });
        var second = await Ask(commands, "setState", new { key = "favourites", value = new { unit = new[] { "uhpm" } } });
        var third = await Ask(commands, "setState", new { key = "terminalHeight", value = 320 });
        var noValue = await Ask(commands, "setState", new { key = "x" });
        var noKey = await Ask(commands, "setState", new { key = "", value = 1 });

        Assert.True(first.GetProperty("ok").GetBoolean());
        Assert.True(second.GetProperty("ok").GetBoolean());
        Assert.True(third.GetProperty("ok").GetBoolean());
        Assert.Equal("badRequest", noValue.GetProperty("error").GetProperty("code").GetString());
        Assert.Equal("badRequest", noKey.GetProperty("error").GetProperty("code").GetString());
        var state = Parse(File.ReadAllText(Path.Combine(_folder, "state.json")));
        Assert.Equal(320, state.GetProperty("terminalHeight").GetInt32());
        Assert.Equal("uhpm", state.GetProperty("favourites").GetProperty("unit")[0].GetString());
        Assert.False(state.TryGetProperty("x", out _));
    }

    [Fact]
    public async Task openHome_opens_the_folder_the_themes_folder_or_a_file()
    {
        var opened = new List<string>();
        var commands = Make(_ => throw new InvalidOperationException(), open: opened.Add);

        await Ask(commands, "openHome", new { });
        await Ask(commands, "openHome", new { file = "themes" });
        await Ask(commands, "openHome", new { file = "themes/mine.json" });
        await Ask(commands, "openHome", new { file = "settings.json" });

        Assert.Equal(
            [
                _folder,
                Path.Combine(_folder, "themes"),
                Path.Combine(_folder, "themes", "mine.json"),
                Path.Combine(_folder, "settings.json"),
            ],
            opened);
        Assert.True(Directory.Exists(Path.Combine(_folder, "themes")));   // a folder the shell opens is there
    }

    [Theory]
    [InlineData("../x")]
    [InlineData("state.json")]
    [InlineData("schemas")]
    [InlineData("themes/a/b.json")]
    public async Task openHome_refuses_anything_else(string file)
    {
        var opened = new List<string>();
        var commands = Make(_ => throw new InvalidOperationException(), open: opened.Add);

        var reply = await Ask(commands, "openHome", new { file });

        Assert.Equal("badRequest", reply.GetProperty("error").GetProperty("code").GetString());
        Assert.Empty(opened);
    }

    [Fact]
    public async Task homeChanged_passes_on_what_the_folder_watcher_hears()
    {
        var home = HomeWith();
        var commands = new Commands(home, _ => null, _ => throw new InvalidOperationException());
        var heard = new TaskCompletionSource<HomeChange>(TaskCreationOptions.RunContinuationsAsynchronously);
        commands.HomeChanged += change => heard.TrySetResult(change);
        home.Watch();

        File.WriteAllText(Path.Combine(_folder, "hotkeys.json"), "{}");

        Assert.Equal(new HomeChange("hotkeys.json", "{}"), await heard.Task.WaitAsync(TimeSpan.FromSeconds(5)));
    }

    // Starts the game data at the folder in settings.json, then watches the folder. The loads are listed; one of
    // them ends the wait when it is for the folder named.
    private async Task<(Home Home, Commands Commands, List<string> Loaded, Task Reached)> Watching(
        string? first, string? reaches, Func<string?>? ask = null, Func<string?>? findGame = null)
    {
        var home = HomeWith(first);
        var loaded = new List<string>();
        var reached = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var commands = new Commands(
            home,
            _ => ask == null ? null : ask(),
            folder =>
            {
                lock (loaded)
                {
                    loaded.Add(folder);
                }

                if (folder == reaches)
                {
                    reached.TrySetResult();
                }

                throw new IOException("stop here");
            },
            findGame: findGame);
        await commands.StartLoading();
        home.Watch();
        return (home, commands, loaded, reached.Task);
    }

    [Fact]
    public async Task A_game_folder_written_to_settings_starts_loading_it()
    {
        var (_, commands, loaded, reached) = await Watching(@"C:\A", @"C:\B");

        File.WriteAllText(Path.Combine(_folder, "settings.json"), """{ "game.folder": "C:\\B" }""");
        await reached.WaitAsync(TimeSpan.FromSeconds(5));
        await commands.Loading;

        Assert.Equal([@"C:\A", @"C:\B"], loaded);
        var state = (await Ask(commands, "gameData")).GetProperty("result");
        Assert.Equal(@"C:\B", state.GetProperty("source").GetString());
    }

    [Fact]
    public async Task Taking_the_game_folder_out_of_settings_loads_the_install_found()
    {
        var (_, commands, loaded, reached) = await Watching(@"C:\A", @"C:\Found", findGame: () => @"C:\Found");

        File.WriteAllText(Path.Combine(_folder, "settings.json"), "{}");
        await reached.WaitAsync(TimeSpan.FromSeconds(5));
        await commands.Loading;

        Assert.Equal([@"C:\A", @"C:\Found"], loaded);
    }

    [Fact]
    public async Task The_game_folder_already_in_use_is_not_loaded_again()
    {
        // The page writes game.folder once a folder chosen with chooseGameData has loaded.
        var (home, commands, loaded, _) = await Watching(null, null, () => @"C:\B");
        await Ask(commands, "chooseGameData");
        await commands.Loading;
        var written = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        home.GameFolderChanged += _ => written.TrySetResult();   // after the commands' own handler has run

        File.WriteAllText(Path.Combine(_folder, "settings.json"), """{ "game.folder": "C:\\b" }""");
        await written.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await commands.Loading;

        Assert.Equal([@"C:\B"], loaded);
    }
}
