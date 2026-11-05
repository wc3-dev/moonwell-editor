using System.Text;
using System.Text.Json;
using MoonwellEditor.App;

namespace MoonwellEditor.App.Tests;

public sealed class HomeTests : IDisposable
{
    private static readonly TimeSpan Patience = TimeSpan.FromSeconds(5);

    private readonly string _root =
        Path.Combine(Path.GetTempPath(), "MoonwellEditor.App.Tests", Guid.NewGuid().ToString("N"));

    private readonly List<Home> _homes = [];

    private string Folder => Path.Combine(_root, ".moonwell");

    private string Legacy => Path.Combine(_root, "legacy");

    public void Dispose()
    {
        // A watcher holds its folder, so the homes go first.
        foreach (var home in _homes)
        {
            home.Dispose();
        }

        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, true);
        }
    }

    private Home Open()
    {
        var home = new Home(Folder, Legacy);
        _homes.Add(home);
        return home;
    }

    private string Put(string folder, string file, string text, Encoding? encoding = null)
    {
        var path = Path.Combine(folder, file.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, text, encoding ?? new UTF8Encoding(false));
        return path;
    }

    private string PutHome(string file, string text, Encoding? encoding = null) => Put(Folder, file, text, encoding);

    private void PutLegacy(string text) => Put(Legacy, "settings.json", text);

    private static JsonElement Value(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static JsonElement BootOf(Home home)
    {
        var script = home.BootScript();
        const string Start = "window.moonwellHome = ";
        Assert.StartsWith(Start, script);
        Assert.EndsWith(";", script);
        return JsonDocument.Parse(script[Start.Length..^1]).RootElement.Clone();
    }

    [Fact]
    public void Default_folder_is_the_variable_then_the_home_folder()
    {
        var home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".moonwell");

        Assert.Equal("MOONWELL_EDITOR_HOME", Home.FolderVariable);
        Assert.Equal(@"D:\scratch\home", Home.DefaultFolder(name => name == Home.FolderVariable ? @"D:\scratch\home" : null));
        Assert.Equal(home, Home.DefaultFolder(_ => null));
        Assert.Equal(home, Home.DefaultFolder(_ => ""));
    }

    [Fact]
    public void Game_folder_comes_from_settings_with_comments_and_trailing_commas()
    {
        PutHome("settings.json", """
            {
              // where Warcraft III is
              "game.folder": "C:\\Games\\Warcraft III", /* the install */
              "appearance.theme": "nord",
            }
            """);

        Assert.Equal(@"C:\Games\Warcraft III", Open().GameFolder);
    }

    [Fact]
    public void Game_folder_is_null_when_settings_say_null()
    {
        PutHome("settings.json", """{ "game.folder": null }""");
        PutLegacy("""{ "gameFolder": "C:\\Old" }""");

        Assert.Null(Open().GameFolder);
    }

    [Fact]
    public void Legacy_game_folder_is_used_only_without_settings()
    {
        PutLegacy("""{ "gameFolder": "C:\\Old", "recentMaps": [] }""");

        Assert.Equal(@"C:\Old", Open().GameFolder);

        PutHome("settings.json", "{}");

        Assert.Null(Open().GameFolder);
    }

    [Fact]
    public void Settings_that_cannot_be_parsed_do_not_fall_back_to_the_legacy_file()
    {
        PutHome("settings.json", "{ this is not json");
        PutLegacy("""{ "gameFolder": "C:\\Old" }""");

        var home = Open();

        Assert.Null(home.GameFolder);
        Assert.Equal(JsonValueKind.Null, BootOf(home).GetProperty("legacy").ValueKind);
    }

    [Fact]
    public void Settings_with_a_key_twice_are_a_mistake_and_do_not_stop_the_editor_starting()
    {
        PutHome("settings.json", """{ "game.folder": "C:\\A", "editor.reopenLastMap": true, "game.folder": "C:\\B" }""");

        var home = Open();

        Assert.Null(home.GameFolder);
        Assert.False(home.ReopenLastMap);
    }

    [Fact]
    public void A_state_file_with_a_key_twice_is_a_mistake_and_a_map_is_still_remembered()
    {
        PutHome("state.json", """{ "recentMaps": ["C:\\Maps\\A"], "recentMaps": ["C:\\Maps\\B"] }""");
        var home = Open();

        Assert.Empty(home.RecentMaps);
        home.RememberMap(@"C:\Maps\C");
        Assert.Equal([@"C:\Maps\C"], home.RecentMaps);
    }

    [Fact]
    public void Missing_files_give_defaults()
    {
        var home = Open();

        Assert.Null(home.GameFolder);
        Assert.Empty(home.RecentMaps);
        Assert.Equal(Folder, home.Folder);
    }

    [Fact]
    public void A_byte_order_mark_is_read_like_any_file()
    {
        var text = """{ "game.folder": "C:\\Games\\Warcraft III" }""";
        PutHome("settings.json", text, new UTF8Encoding(true));

        var home = Open();

        Assert.Equal(@"C:\Games\Warcraft III", home.GameFolder);
        Assert.Equal(text, BootOf(home).GetProperty("settings").GetString());
    }

    [Fact]
    public void The_last_theme_gives_the_window_its_colours()
    {
        PutHome("state.json", """
            {
              "recentMaps": [],
              "lastTheme": {
                "id": "light-plus",
                "scheme": "light",
                "vars": { "--background-gutter": "#e1e1e1", "--background-panel": "#ffffff", "--border-normal": "#D1D1D1" }
              }
            }
            """);

        var home = Open();

        Assert.Equal(new PageColors("#e1e1e1", "#ffffff", "#D1D1D1"), home.LastPageColors);
    }

    [Theory]
    [InlineData("""{ "recentMaps": [] }""")]
    [InlineData("""{ "lastTheme": { "vars": { "--background-gutter": "#e1e1e1", "--background-panel": "#ffffff" } } }""")]
    [InlineData("""{ "lastTheme": { "vars": { "--background-gutter": "red", "--background-panel": "#ffffff", "--border-normal": "#d1d1d1" } } }""")]
    [InlineData("""{ "lastTheme": "light-plus" }""")]
    [InlineData("not json")]
    [InlineData("""{ "lastTheme": { "vars": {} }, "lastTheme": { "vars": {} } }""")]
    [InlineData("""{ "lastTheme": { "vars": { "--background-gutter": "#e1e1e1", "--background-gutter": "#e2e2e2", "--background-panel": "#ffffff", "--border-normal": "#d1d1d1" } } }""")]
    public void No_last_theme_leaves_the_window_its_own_colours(string state)
    {
        PutHome("state.json", state);

        Assert.Null(Open().LastPageColors);
    }

    [Fact]
    public void No_state_file_leaves_the_window_its_own_colours() => Assert.Null(Open().LastPageColors);

    [Fact]
    public void Remembered_maps_are_newest_first_without_duplicates_and_at_most_ten()
    {
        var home = Open();
        for (var i = 1; i <= 12; i++)
        {
            home.RememberMap($@"C:\Maps\map{i}");
        }

        home.RememberMap(@"c:\maps\MAP5");   // the same folder, spelled differently

        Assert.Equal(10, home.RecentMaps.Count);
        Assert.Equal(@"c:\maps\MAP5", home.RecentMaps[0]);
        Assert.Equal(@"C:\Maps\map12", home.RecentMaps[1]);
        Assert.Single(home.RecentMaps, map => map.Equals(@"C:\Maps\map5", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(@"C:\Maps\map2", home.RecentMaps);
        Assert.Equal(home.RecentMaps, new Home(Folder).RecentMaps);   // saved
    }

    [Fact]
    public void A_forgotten_map_leaves_the_others_in_their_order()
    {
        var home = Open();
        home.RememberMap(@"C:\Maps\a");
        home.RememberMap(@"C:\Maps\b");
        home.RememberMap(@"C:\Maps\c");

        home.ForgetMap(@"c:\maps\B");   // the same folder, spelled differently

        Assert.Equal([@"C:\Maps\c", @"C:\Maps\a"], home.RecentMaps);
        Assert.Equal(home.RecentMaps, new Home(Folder).RecentMaps);   // saved
    }

    [Theory]
    [InlineData("""{ "editor.reopenLastMap": true }""", true)]
    [InlineData("""{ "editor.reopenLastMap": true, /* a comment */ }""", true)]
    [InlineData("""{ "editor.reopenLastMap": false }""", false)]
    [InlineData("""{ "editor.reopenLastMap": "yes" }""", false)]
    [InlineData("""{ }""", false)]
    [InlineData("""{ "editor.reopenLastMap": tru""", false)]
    public void Reopening_the_last_map_is_read_from_settings(string text, bool reopens)
    {
        PutHome("settings.json", text);

        Assert.Equal(reopens, Open().ReopenLastMap);
    }

    [Fact]
    public void Reopening_the_last_map_follows_the_file_as_it_is_now()
    {
        var home = Open();
        Assert.False(home.ReopenLastMap);

        PutHome("settings.json", """{ "editor.reopenLastMap": true }""");

        Assert.True(home.ReopenLastMap);
    }

    [Fact]
    public void Remembered_maps_start_from_the_legacy_file()
    {
        PutLegacy("""{ "gameFolder": null, "recentMaps": ["C:\\Maps\\a", "C:\\Maps\\b"] }""");

        var home = Open();

        Assert.Equal([@"C:\Maps\a", @"C:\Maps\b"], home.RecentMaps);
        Assert.False(File.Exists(Path.Combine(Folder, "state.json")));   // reading does not write

        home.RememberMap(@"C:\Maps\c");
        PutLegacy("""{ "recentMaps": ["C:\\Maps\\other"] }""");

        Assert.Equal([@"C:\Maps\c", @"C:\Maps\a", @"C:\Maps\b"], Open().RecentMaps);   // state.json is used from now on
    }

    [Fact]
    public void SetState_keeps_the_other_keys()
    {
        var home = Open();
        home.RememberMap(@"C:\Maps\a");

        home.SetState("terminalHeight", Value("300"));
        home.SetState("columns", Value("""{ "unit": ["uhpm"] }"""));
        home.SetState("terminalHeight", Value("320"));

        using var state = JsonDocument.Parse(File.ReadAllText(Path.Combine(Folder, "state.json")));
        Assert.Equal(320, state.RootElement.GetProperty("terminalHeight").GetInt32());
        Assert.Equal("uhpm", state.RootElement.GetProperty("columns").GetProperty("unit")[0].GetString());
        Assert.Equal(@"C:\Maps\a", state.RootElement.GetProperty("recentMaps")[0].GetString());
        Assert.Equal([@"C:\Maps\a"], Open().RecentMaps);
    }

    [Theory]
    [InlineData("../x.json")]
    [InlineData(@"..\x.json")]
    [InlineData("themes/../../x.json")]
    [InlineData("state.json")]
    [InlineData("config.toml")]
    [InlineData("Settings.json")]
    [InlineData("themes/a/b.json")]
    [InlineData(@"themes\a.json")]
    [InlineData("themes/.json")]
    [InlineData("themes/.hidden.json")]
    [InlineData("themes/a.json\n")]
    [InlineData("themes/a.json:stream")]
    [InlineData("themes/a.txt")]
    [InlineData("schemas/theme.json")]
    [InlineData("schemas/a/b.schema.json")]
    [InlineData("")]
    public void Write_refuses_names_outside_the_folder(string file)
    {
        var home = Open();

        Assert.Throws<ArgumentException>(() => home.Write(file, "{}"));

        Assert.False(File.Exists(Path.Combine(_root, "x.json")));
        Assert.False(Directory.Exists(Folder));
    }

    [Fact]
    public void Write_makes_the_folders_and_the_file_and_leaves_no_temporary_file()
    {
        var home = Open();
        var files = new[]
        {
            "settings.json", "hotkeys.json", "themes/My Theme.json", "themes/a.b-c_d.json", "schemas/theme.schema.json",
        };

        foreach (var file in files)
        {
            home.Write(file, "{ \"file\": \"" + file + "\" }");
        }

        foreach (var file in files)
        {
            Assert.Equal("{ \"file\": \"" + file + "\" }", File.ReadAllText(Path.Combine(Folder, file)));
        }

        Assert.Empty(Directory.EnumerateFiles(Folder, "*.tmp", SearchOption.AllDirectories));
    }

    [Fact]
    public void Write_leaves_an_unchanged_file_alone()
    {
        var home = Open();
        home.Write("settings.json", "{ \"a\": 1 }");
        var path = Path.Combine(Folder, "settings.json");
        var old = new DateTime(2020, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        File.SetLastWriteTimeUtc(path, old);

        home.Write("settings.json", "{ \"a\": 1 }");

        Assert.Equal(old, File.GetLastWriteTimeUtc(path));

        home.Write("settings.json", "{ \"a\": 2 }");

        Assert.NotEqual(old, File.GetLastWriteTimeUtc(path));
        Assert.Equal("{ \"a\": 2 }", File.ReadAllText(path));
    }

    [Fact]
    public void Boot_script_holds_the_files()
    {
        var theme = "// from \"Nord\"\n{ \"name\": \"Nord \u00e5\", \"type\": \"dark\" }\n";
        PutHome("settings.json", "{ \"game.folder\": \"C:\\\\Games\" }");
        PutHome("state.json", """{ "terminalHeight": 300 }""");
        PutHome("themes/b.json", theme);
        PutHome("themes/a.json", "{}");
        PutHome("themes/notes.txt", "not a theme");
        PutHome("themes/mine.json.tmp", "half");

        var boot = BootOf(Open());

        Assert.Equal(Folder, boot.GetProperty("folder").GetString());
        Assert.Equal("{ \"game.folder\": \"C:\\\\Games\" }", boot.GetProperty("settings").GetString());
        Assert.Equal(JsonValueKind.Null, boot.GetProperty("hotkeys").ValueKind);
        Assert.Equal("""{ "terminalHeight": 300 }""", boot.GetProperty("state").GetString());
        var themes = boot.GetProperty("themes").EnumerateArray().ToList();
        Assert.Equal(["themes/a.json", "themes/b.json"], themes.Select(entry => entry.GetProperty("file").GetString()));
        Assert.Equal("{}", themes[0].GetProperty("text").GetString());
        Assert.Equal(theme, themes[1].GetProperty("text").GetString());
        Assert.Equal(JsonValueKind.Null, boot.GetProperty("legacy").ValueKind);
        Assert.Equal(JsonValueKind.Array, boot.GetProperty("unreadable").ValueKind);
        Assert.Empty(boot.GetProperty("unreadable").EnumerateArray());
    }

    [Fact]
    public void Boot_script_has_the_legacy_settings_only_without_settings_json()
    {
        PutLegacy("""{ "gameFolder": "C:\\Old" }""");

        var without = BootOf(Open());

        Assert.Equal(@"C:\Old", without.GetProperty("legacy").GetProperty("gameFolder").GetString());
        Assert.Equal(JsonValueKind.Null, without.GetProperty("settings").ValueKind);
        Assert.Empty(without.GetProperty("themes").EnumerateArray());

        PutHome("settings.json", "{}");

        Assert.Equal(JsonValueKind.Null, BootOf(Open()).GetProperty("legacy").ValueKind);
    }

    [Fact]
    public void Boot_script_has_an_empty_legacy_when_nothing_is_left_from_before()
    {
        var legacy = BootOf(Open()).GetProperty("legacy");

        Assert.Equal(JsonValueKind.Object, legacy.ValueKind);
        Assert.Equal(JsonValueKind.Null, legacy.GetProperty("gameFolder").ValueKind);
    }

    // A file another program has open and lets no one else read, as an editor or a scanner may for a moment.
    private static FileStream Hold(string path) => new(path, FileMode.Open, FileAccess.Read, FileShare.None);

    [Fact]
    public async Task Boot_script_waits_for_a_file_that_is_held_for_a_moment()
    {
        PutLegacy("""{ "gameFolder": "C:\\Old" }""");
        var settings = PutHome("settings.json", """{ "appearance.theme": "nord" }""");
        var theme = PutHome("themes/mine.json", "{ \"name\": \"Mine\" }");
        var home = Open();
        using var heldSettings = Hold(settings);
        using var heldTheme = Hold(theme);
        var released = Task.Run(async () =>
        {
            await Task.Delay(40);
            heldSettings.Dispose();
            heldTheme.Dispose();
        });

        var boot = BootOf(home);
        await released;

        Assert.Equal("""{ "appearance.theme": "nord" }""", boot.GetProperty("settings").GetString());
        Assert.Equal("themes/mine.json", boot.GetProperty("themes")[0].GetProperty("file").GetString());
        Assert.Equal(JsonValueKind.Null, boot.GetProperty("legacy").ValueKind);
        Assert.Empty(boot.GetProperty("unreadable").EnumerateArray());   // it was read in the end
    }

    [Fact]
    public void A_file_that_stays_unreadable_is_not_taken_for_a_missing_one()
    {
        PutLegacy("""{ "gameFolder": "C:\\Old" }""");
        var settings = PutHome("settings.json", """{ "game.folder": "C:\\Chosen" }""");
        using var held = Hold(settings);

        var home = Open();
        var boot = BootOf(home);

        // The file is there, so the move from the old settings has happened and the old folder is not used.
        Assert.Null(home.GameFolder);
        Assert.Equal(JsonValueKind.Null, boot.GetProperty("settings").ValueKind);
        Assert.Equal(JsonValueKind.Null, boot.GetProperty("legacy").ValueKind);
        Assert.Equal(["settings.json"], boot.GetProperty("unreadable").EnumerateArray().Select(name => name.GetString()));
    }

    [Fact]
    public void Boot_script_lists_the_files_it_could_not_read()
    {
        var settings = PutHome("settings.json", "{}");
        PutHome("hotkeys.json", """{ "save": [] }""");
        PutHome("state.json", "{}");
        var held = PutHome("themes/held.json", "{ \"name\": \"Held\" }");
        PutHome("themes/fine.json", "{ \"name\": \"Fine\" }");
        var home = Open();
        using var heldSettings = Hold(settings);
        using var heldTheme = Hold(held);

        var boot = BootOf(home);

        // A file that is there but stays held is named, with no text; one that was read is not.
        var unreadable = boot.GetProperty("unreadable").EnumerateArray().Select(name => name.GetString());
        Assert.Equal(["settings.json", "themes/held.json"], unreadable);
        Assert.Equal(JsonValueKind.Null, boot.GetProperty("settings").ValueKind);
        Assert.Equal("""{ "save": [] }""", boot.GetProperty("hotkeys").GetString());
        Assert.Equal("{}", boot.GetProperty("state").GetString());
        var themes = boot.GetProperty("themes").EnumerateArray().Select(entry => entry.GetProperty("file").GetString());
        Assert.Equal(["themes/fine.json"], themes);
    }

    [Fact]
    public void A_file_that_is_missing_is_not_listed_as_unreadable()
    {
        PutHome("hotkeys.json", "{}");

        var boot = BootOf(Open());

        Assert.Equal(JsonValueKind.Null, boot.GetProperty("settings").ValueKind);
        Assert.Empty(boot.GetProperty("unreadable").EnumerateArray());
    }

    [Fact]
    public void Two_homes_on_one_folder_keep_each_others_state_keys()
    {
        var first = Open();
        var second = Open();   // both are made before either writes

        first.SetState("favourites", Value("""{ "unit": ["uhpm"] }"""));
        second.SetState("columns", Value("""{ "unit": ["umvs"] }"""));
        first.RememberMap(@"C:\Maps\a");
        second.SetState("terminalHeight", Value("300"));

        using var state = JsonDocument.Parse(File.ReadAllText(Path.Combine(Folder, "state.json")));
        Assert.Equal("uhpm", state.RootElement.GetProperty("favourites").GetProperty("unit")[0].GetString());
        Assert.Equal("umvs", state.RootElement.GetProperty("columns").GetProperty("unit")[0].GetString());
        Assert.Equal(300, state.RootElement.GetProperty("terminalHeight").GetInt32());
        Assert.Equal(@"C:\Maps\a", state.RootElement.GetProperty("recentMaps")[0].GetString());
    }

    [Fact]
    public void Recent_maps_include_the_other_homes_maps_after_the_next_RememberMap()
    {
        var first = Open();
        var second = Open();

        first.RememberMap(@"C:\Maps\a1");
        second.RememberMap(@"C:\Maps\b1");
        first.RememberMap(@"C:\Maps\a2");

        Assert.Equal([@"C:\Maps\a2", @"C:\Maps\b1", @"C:\Maps\a1"], first.RecentMaps);
        Assert.Equal([@"C:\Maps\a2", @"C:\Maps\b1", @"C:\Maps\a1"], second.RecentMaps);
    }

    [Fact]
    public void A_state_file_that_cannot_be_read_is_not_written_over()
    {
        var path = PutHome("state.json", """{ "terminalHeight": 300 }""");
        var home = Open();
        using (Hold(path))
        {
            Assert.ThrowsAny<IOException>(() => home.SetState("columns", Value("[]")));
            Assert.ThrowsAny<IOException>(() => home.RememberMap(@"C:\Maps\a"));
        }

        Assert.Equal("""{ "terminalHeight": 300 }""", File.ReadAllText(path));
    }

    [Fact]
    public void A_side_file_another_editor_holds_does_not_stop_a_save()
    {
        Directory.CreateDirectory(Folder);
        var home = Open();
        using var settings = new FileStream(
            Path.Combine(Folder, "settings.json.tmp"), FileMode.Create, FileAccess.Write, FileShare.None);
        using var state = new FileStream(
            Path.Combine(Folder, "state.json.tmp"), FileMode.Create, FileAccess.Write, FileShare.None);

        home.Write("settings.json", "{ \"a\": 1 }");
        home.SetState("terminalHeight", Value("300"));

        Assert.Equal("{ \"a\": 1 }", File.ReadAllText(Path.Combine(Folder, "settings.json")));
        Assert.Contains("300", File.ReadAllText(Path.Combine(Folder, "state.json")));
    }

    [Fact]
    public void A_save_that_fails_leaves_no_side_file()
    {
        var path = PutHome("settings.json", "{}");
        var home = Open();
        using (Hold(path))
        {
            Assert.ThrowsAny<Exception>(() => home.Write("settings.json", "{ \"a\": 1 }"));
        }

        Assert.Empty(Directory.EnumerateFiles(Folder, "*.tmp", SearchOption.AllDirectories));
        Assert.Equal("{}", File.ReadAllText(path));
    }

    [Fact]
    public void Watch_carries_on_when_the_folder_is_a_file()
    {
        Directory.CreateDirectory(_root);
        File.WriteAllText(Folder, "not a folder");
        var home = Open();

        home.Watch();

        Assert.Null(home.GameFolder);
        Assert.Contains("window.moonwellHome", home.BootScript());
    }

    [Fact]
    public void Watch_carries_on_when_the_themes_folder_is_a_file()
    {
        PutHome("themes", "not a folder");
        var home = Open();

        home.Watch();

        Assert.Empty(BootOf(home).GetProperty("themes").EnumerateArray());
    }

    [Fact]
    public void A_folder_that_cannot_exist_does_not_stop_the_editor_starting()
    {
        var home = new Home(Path.Combine(_root, "bad\0name"), Legacy);
        _homes.Add(home);

        home.Watch();

        Assert.Null(home.GameFolder);
        Assert.Contains("window.moonwellHome", home.BootScript());
    }

    // Waits for the first change of a file; the watcher raises on a thread of its own.
    private static Task<HomeChange> Next(Home home, string file)
    {
        var heard = new TaskCompletionSource<HomeChange>(TaskCreationOptions.RunContinuationsAsynchronously);
        home.Changed += change =>
        {
            if (change.File == file)
            {
                heard.TrySetResult(change);
            }
        };
        return heard.Task;
    }

    [Fact]
    public async Task Watch_reports_a_saved_theme()
    {
        var home = Open();
        home.Watch();
        var heard = Next(home, "themes/mine.json");

        File.WriteAllText(Path.Combine(Folder, "themes", "mine.json"), "{ \"name\": \"Mine\" }");

        var change = await heard.WaitAsync(Patience);
        Assert.Equal("{ \"name\": \"Mine\" }", change.Text);
    }

    [Fact]
    public async Task Watch_reports_a_deleted_theme_with_no_text()
    {
        var path = PutHome("themes/mine.json", "{}");
        var home = Open();
        home.Watch();
        var heard = Next(home, "themes/mine.json");

        File.Delete(path);

        Assert.Null((await heard.WaitAsync(Patience)).Text);
    }

    [Fact]
    public async Task Watch_reports_settings_and_hotkeys_once_and_never_the_temporary_file()
    {
        var home = Open();
        home.Watch();
        var changes = new List<HomeChange>();
        home.Changed += change =>
        {
            lock (changes)
            {
                changes.Add(change);
            }
        };
        var heard = Next(home, "hotkeys.json");

        home.Write("settings.json", "{ \"a\": 1 }");
        home.Write("hotkeys.json", "{ \"save\": [] }");
        await heard.WaitAsync(Patience);
        await Task.Delay(500);

        lock (changes)
        {
            Assert.Equal(["hotkeys.json", "settings.json"], changes.Select(change => change.File).Order());
            Assert.Equal("{ \"a\": 1 }", changes.Single(change => change.File == "settings.json").Text);
        }
    }

    [Fact]
    public async Task Watch_reports_a_changed_game_folder()
    {
        PutHome("settings.json", """{ "game.folder": "C:\\A" }""");
        var home = Open();
        home.Watch();
        var folders = new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);
        home.GameFolderChanged += folder => folders.TrySetResult(folder);

        File.WriteAllText(Path.Combine(Folder, "settings.json"), """{ "game.folder": "C:\\B" }""");

        Assert.Equal(@"C:\B", await folders.Task.WaitAsync(Patience));
        Assert.Equal(@"C:\B", home.GameFolder);
    }

    [Fact]
    public async Task Watch_reports_the_install_found_when_the_game_folder_is_taken_out()
    {
        PutHome("settings.json", """{ "game.folder": "C:\\A" }""");
        var home = Open();
        home.Watch();
        var folders = new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);
        home.GameFolderChanged += folder => folders.TrySetResult(folder);

        File.WriteAllText(Path.Combine(Folder, "settings.json"), """{ "appearance.theme": "nord" }""");

        Assert.Null(await folders.Task.WaitAsync(Patience));
        Assert.Null(home.GameFolder);
    }

    [Fact]
    public async Task Watch_ignores_a_settings_change_that_leaves_the_game_folder_as_it_was()
    {
        PutHome("settings.json", """{ "game.folder": "C:\\A" }""");
        var home = Open();
        home.Watch();
        var moved = false;
        home.GameFolderChanged += _ => moved = true;
        var heard = Next(home, "settings.json");

        File.WriteAllText(
            Path.Combine(Folder, "settings.json"), """{ "game.folder": "C:\\A", "appearance.theme": "nord" }""");
        await heard.WaitAsync(Patience);
        await Task.Delay(300);

        Assert.False(moved);
    }

    [Fact]
    public async Task Watch_keeps_the_game_folder_while_settings_have_a_mistake()
    {
        PutHome("settings.json", """{ "game.folder": "C:\\A" }""");
        var home = Open();
        home.Watch();
        var moved = false;
        home.GameFolderChanged += _ => moved = true;
        var heard = Next(home, "settings.json");

        File.WriteAllText(Path.Combine(Folder, "settings.json"), "{ \"game.folder\": ");
        var change = await heard.WaitAsync(Patience);
        await Task.Delay(300);

        Assert.Equal("{ \"game.folder\": ", change.Text);   // the page is still told, it shows the mistake
        Assert.False(moved);
        Assert.Equal(@"C:\A", home.GameFolder);
    }

    [Fact]
    public void The_boot_script_is_written_as_before()
    {
        Put(Folder, "settings.json", "{\"a\":1}");
        Put(Path.Combine(Folder, "themes"), "x.json", "{}");
        var home = Open();

        var before = new
        {
            folder = Folder,
            settings = (string?)"{\"a\":1}",
            hotkeys = (string?)null,
            state = (string?)null,
            themes = new[] { new { file = "themes/x.json", text = "{}" } },
            legacy = (object?)null,
            unreadable = Array.Empty<string>(),
        };
        Assert.Equal(
            "window.moonwellHome = " + JsonSerializer.Serialize(before, new JsonSerializerOptions(JsonSerializerDefaults.Web)) + ";",
            home.BootScript());
    }

    [Fact]
    public void Without_settings_the_boot_script_names_the_legacy_folder_as_before()
    {
        var home = Open();

        Assert.Contains(",\"legacy\":{\"gameFolder\":null},", home.BootScript());
    }
}
