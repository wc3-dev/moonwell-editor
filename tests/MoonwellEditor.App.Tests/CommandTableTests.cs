using System.Reflection;
using System.Text.Json;
using MoonwellEditor.App;
using Xunit.Abstractions;

namespace MoonwellEditor.App.Tests;

public sealed class CommandTableTests(GameDataFixture fixture, ITestOutputHelper output)
    : IClassFixture<GameDataFixture>, IDisposable
{
    private readonly string _root =
        Path.Combine(Path.GetTempPath(), "MoonwellEditor.App.Tests", Guid.NewGuid().ToString("N"));

    private readonly List<Home> _homes = [];

    private readonly List<GameAssets> _assets = [];

    public void Dispose()
    {
        foreach (var assets in _assets)
        {
            assets.Dispose();
        }

        foreach (var home in _homes)
        {
            home.Dispose();
        }

        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, true);
        }
    }

    [Fact]
    public void An_answer_that_can_be_null_has_to_say_so()
    {
        // Of takes a notnull answer, so a handler that returns Foo? does not compile there; OfNullable is the way.
        var plain = typeof(CommandEntry).GetMethods().Where(method => method.Name == nameof(CommandEntry.Of)).ToList();

        Assert.NotEmpty(plain);
        Assert.All(plain, method => Assert.True(
            NotNull(method.GetGenericArguments()[^1]), $"{method} takes an answer that may be null"));
        Assert.Equal(
            ["currentMap", "openMap"],
            Commands.Table.Where(entry => entry.AnswerNullable).Select(entry => entry.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public void The_check_tells_an_unconstrained_answer_apart() =>
        Assert.False(NotNull(
            typeof(CommandTableTests).GetMethod(nameof(Unconstrained), BindingFlags.NonPublic | BindingFlags.Static)!
                .GetGenericArguments()[0]));

    private static void Unconstrained<T>()
    {
    }

    // A type parameter's nullability as the compiler wrote it: its own [Nullable], else its method's or type's
    // [NullableContext]. 1 is notnull; an unconstrained one in a nullable context is 2.
    private static bool NotNull(Type parameter) =>
        (FlagOf(parameter.GetCustomAttributesData(), "NullableAttribute")
            ?? FlagOf(parameter.DeclaringMethod!.GetCustomAttributesData(), "NullableContextAttribute")
            ?? FlagOf(parameter.DeclaringMethod!.DeclaringType!.GetCustomAttributesData(), "NullableContextAttribute"))
        == 1;

    private static byte? FlagOf(IEnumerable<CustomAttributeData> attributes, string name) =>
        attributes.FirstOrDefault(attribute => attribute.AttributeType.Name == name)?.ConstructorArguments is
            [{ Value: byte flag }]
            ? flag
            : null;

    [Fact]
    public void Every_name_is_once_in_the_table()
    {
        var names = Commands.Table.Select(entry => entry.Name).ToList();

        Assert.Equal(names.Count, names.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public async Task A_missing_argument_is_a_bad_request() =>
        Assert.Equal("badRequest", ErrorOf(await Ask(NoData(), "tree", new { })));

    [Fact]
    public async Task A_null_where_none_is_taken_is_a_bad_request() =>
        Assert.Equal("badRequest", ErrorOf(await Ask(NoData(), "object", new { kind = "unit", id = (string?)null })));

    [Fact]
    public async Task A_number_as_text_is_a_bad_request() =>
        Assert.Equal("badRequest", ErrorOf(await Ask(NoData(), "search", new { query = "a", limit = "3" })));

    [Fact]
    public async Task A_kind_by_its_name_is_a_bad_request() =>
        Assert.Equal("badRequest", ErrorOf(await Ask(NoData(), "tree", new { kind = "Unit" })));

    [Fact]
    public async Task A_name_in_another_case_is_a_bad_request() =>
        Assert.Equal("badRequest", ErrorOf(await Ask(NoData(), "tree", new { Kind = "unit" })));

    [Fact]
    public async Task An_edit_without_a_value_is_a_bad_request_not_a_reset()
    {
        var edits = new[] { new { id = "hfoo", field = "uhpm", level = 0 } };

        Assert.Equal("badRequest", ErrorOf(await Ask(NoData(), "setCells", new { kind = "unit", edits })));
    }

    [Fact]
    public async Task A_null_in_a_list_is_a_bad_request()
    {
        var commands = NoData();
        var noColumns = Array.Empty<object>();

        var nullId = new { kind = "unit", ids = new string?[] { null }, columns = noColumns };
        Assert.Equal("badRequest", ErrorOf(await Ask(commands, "table", nullId)));
        Assert.Equal("badRequest", ErrorOf(await Ask(commands, "setCells", new { kind = "unit", edits = new object?[] { null } })));
        Assert.Equal("badRequest", ErrorOf(await Ask(commands, "triggerPlaces", new { places = new object?[] { null } })));
    }

    [Fact]
    public async Task An_asset_list_of_textures_is_a_bad_request() =>
        Assert.Equal("badRequest", ErrorOf(await Ask(NoData(), "assetList", new { kind = "texture" })));

    [Fact]
    public async Task The_mode_may_be_left_out_but_not_null()
    {
        var commands = NoData();

        Assert.True((await Ask(commands, "assetList", new { kind = "icon" })).GetProperty("ok").GetBoolean());
        Assert.Equal("badRequest", ErrorOf(await Ask(commands, "assetList", new { kind = "icon", mode = (string?)null })));
    }

    [Fact]
    public async Task An_edit_with_a_null_value_resets()
    {
        if (WithMap() is not { } commands)
        {
            return;
        }

        await Ask(commands, "setField", new { kind = "unit", id = "hfoo", field = "uhpm", level = 0, value = "999" });
        var edits = new[] { new { id = "hfoo", field = "uhpm", level = 0, value = (string?)null } };

        var reply = await Ask(commands, "setCells", new { kind = "unit", edits });

        Assert.Equal(1, Result(reply).GetProperty("changed").GetInt32());
    }

    [Fact]
    public async Task A_new_object_without_an_id_takes_the_next_free_one()
    {
        if (WithMap() is not { } commands)
        {
            return;
        }

        var next = Result(await Ask(commands, "nextId", new { kind = "unit", baseId = "hfoo" })).GetString();

        var made = Result(await Ask(commands, "createObject", new { kind = "unit", baseId = "hfoo" })).GetString();

        Assert.Equal(next, made);
    }

    [Fact]
    public async Task Enabling_a_function_without_saying_how_is_a_bad_request() =>
        Assert.Equal("badRequest", ErrorOf(await Ask(NoData(), "triggerFunctionEnable", new { id = 1, path = "a0" })));

    [Fact]
    public async Task A_trigger_item_kind_by_its_name_is_a_bad_request() =>
        Assert.Equal("badRequest", ErrorOf(await Ask(NoData(), "triggerAdd", new { kind = "Trigger", parent = 0 })));

    [Fact]
    public async Task Trigger_options_with_only_an_id_change_nothing()
    {
        if (WithMap(withAssets: true) is not { } commands)
        {
            return;
        }

        var id = Result(await Ask(commands, "triggerAdd", new { kind = "trigger", parent = 0 })).GetProperty("id").GetInt32();
        var before = Result(await Ask(commands, "trigger", new { id })).ToString();

        Result(await Ask(commands, "triggerOptions", new { id }));

        Assert.Equal(before, Result(await Ask(commands, "trigger", new { id })).ToString());
    }

    [Fact]
    public void The_table_holds_every_command_the_app_had()
    {
        string[] expected =
        [
            "about", "assetList", "assetNames", "chooseGameData", "choices", "closeAsking", "closeClicked", "closeWindow",
            "copyObject", "createObject", "currentMap", "deleteObject", "fields", "forgetMap", "frameColors", "gameData",
            "mapScene", "maximizeWindow", "minimizeWindow", "nextId", "object", "openHome", "openMap", "ping", "recentMaps",
            "redo", "reload", "resetField", "save", "search", "setCells", "setField", "setState", "startup", "table",
            "terminalClose", "terminalResize", "terminalShells", "terminalStart", "terminalWrite", "terrainCliffTypes",
            "terrainCliffs", "terrainStroke", "terrainStrokeEnd", "terrainTiles", "tree", "trigger",
            "triggerAdd", "triggerCards", "triggerCatalog", "triggerCode", "triggerDelete", "triggerFolded",
            "triggerFunctionAdd", "triggerFunctionChange", "triggerFunctionCopy", "triggerFunctionDelete",
            "triggerFunctionEnable", "triggerFunctionMove", "triggerFunctionPaste", "triggerHeader", "triggerMove",
            "triggerOptions", "triggerParameter", "triggerPlaces", "triggerRename", "triggerTree", "triggerVariableAdd",
            "triggerVariableSet", "uiScale", "undo", "usedBy", "windowState", "writeHome",
        ];

        Assert.Equal(
            expected.Order(StringComparer.Ordinal), Commands.Table.Select(entry => entry.Name).Order(StringComparer.Ordinal));
    }

    [Theory]
    [InlineData("terminalShells", true)]
    [InlineData("terminalStart", true)]
    [InlineData("terminalWrite", true)]
    [InlineData("terminalResize", true)]
    [InlineData("terminalClose", true)]
    [InlineData("closeAsking", true)]
    [InlineData("closeWindow", false)]
    [InlineData("tree", false)]
    [InlineData("nope", false)]
    public void Terminal_commands_and_closeAsking_run_beside_the_queue(string command, bool alongside) =>
        Assert.Equal(alongside, Commands.RunsAlongside(command));

    [Fact]
    public void Only_the_three_terminal_writes_are_told() =>
        Assert.Equal(
            ["terminalClose", "terminalResize", "terminalWrite"],
            Commands.Table.Where(entry => entry.Told).Select(entry => entry.Name).Order(StringComparer.Ordinal));

    [Fact]
    public async Task Set_state_without_a_value_is_a_bad_request() =>
        Assert.Equal("badRequest", ErrorOf(await Ask(NoData(), "setState", new { key = "a" })));

    [Fact]
    public async Task Choices_waits_for_the_install_to_open()
    {
        if (fixture.Data == null)
        {
            output.WriteLine(fixture.Reason);
            return;
        }

        var data = fixture.Data;
        var commands = new Commands(NewHome(fixture.Folder), _ => null, _ => data);
        var assets = new GameAssets(() => commands.Store);
        _assets.Add(assets);
        commands.Assets = assets;
        await commands.StartLoading();

        var choices = commands.Run("choices", default);
        Assert.False(choices.IsCompleted);
        assets.Use(Moonwell.GameData.GameFiles.Open(fixture.Folder!));

        var lists = Assert.IsAssignableFrom<IReadOnlyDictionary<string, MoonwellEditor.GameData.ChoiceList>>(await choices);
        Assert.True(lists.ContainsKey("uberSplat"));
    }

    private static async Task<JsonElement> Ask(Commands commands, string command, object args)
    {
        var request = JsonSerializer.Serialize(new { id = 1, command, args });
        return JsonDocument.Parse(await new Bridge(commands.Run).Handle(request)).RootElement.Clone();
    }

    private static string? ErrorOf(JsonElement reply)
    {
        Assert.False(reply.GetProperty("ok").GetBoolean(), reply.ToString());
        return reply.GetProperty("error").GetProperty("code").GetString();
    }

    private static JsonElement Result(JsonElement reply)
    {
        Assert.True(reply.GetProperty("ok").GetBoolean(), reply.ToString());
        return reply.GetProperty("result");
    }

    private Home NewHome(string? gameFolder = null)
    {
        var folder = Path.Combine(_root, "home");
        Directory.CreateDirectory(folder);
        if (gameFolder != null)
        {
            File.WriteAllText(
                Path.Combine(folder, "settings.json"),
                JsonSerializer.Serialize(new Dictionary<string, string?> { ["game.folder"] = gameFolder }));
        }

        var home = new Home(folder);
        _homes.Add(home);
        return home;
    }

    // Commands with no game data and no map: enough for what is refused before a command runs.
    private Commands NoData() => new(NewHome(), _ => null, _ => throw new IOException("no game data here"));

    // Commands with the install's game data and the we-3.0 fixture map open, and with its files for the trigger catalog
    // when asked; null (and the test checks nothing) when there is no install.
    private Commands? WithMap(bool withAssets = false)
    {
        if (fixture.Data == null)
        {
            output.WriteLine(fixture.Reason);
            return null;
        }

        var map = Path.Combine(_root, "map");
        Directory.CreateDirectory(map);
        foreach (var file in Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "fixtures", "we-3.0")))
        {
            File.Copy(file, Path.Combine(map, Path.GetFileName(file)));
        }

        var data = fixture.Data;
        var commands = new Commands(NewHome(fixture.Folder), _ => map, _ => data);
        if (withAssets)
        {
            var assets = new GameAssets(() => commands.Store);
            _assets.Add(assets);
            assets.Use(Moonwell.GameData.GameFiles.Open(fixture.Folder!));
            commands.Assets = assets;
        }

        commands.StartLoading().Wait();
        Result(Ask(commands, "openMap", new { path = map }).Result);
        return commands;
    }
}
