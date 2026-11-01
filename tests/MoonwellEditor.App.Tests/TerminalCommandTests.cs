using System.Text;
using System.Text.Json;
using MoonwellEditor.App;

namespace MoonwellEditor.App.Tests;

public sealed class TerminalCommandTests : IDisposable
{
    private const string Home = @"C:\Users\Someone";

    private readonly Commands _commands = new(
        new Settings(Path.Combine(Path.GetTempPath(), "MoonwellEditor.App.Tests", "terminal")),
        _ => null,
        _ => throw new InvalidOperationException());

    private readonly StringBuilder _output = new();
    private int _exits;

    public TerminalCommandTests()
    {
        _commands.Terminals.Output += (_, text) =>
        {
            lock (_output)
            {
                _output.Append(text);
            }
        };
        _commands.Terminals.Exited += (_, _) => Interlocked.Increment(ref _exits);
    }

    public void Dispose() => _commands.Terminals.Dispose();

    private async Task<JsonElement> Ask(string command, object args)
    {
        var request = JsonSerializer.Serialize(new { id = 1, command, args }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var reply = await new Bridge(_commands.Run).Handle(request);
        return JsonDocument.Parse(reply).RootElement;
    }

    private string Seen()
    {
        lock (_output)
        {
            return _output.ToString();
        }
    }

    private static async Task Until(Func<bool> done, string what)
    {
        for (var waited = 0; waited < 15000; waited += 25)
        {
            if (done())
            {
                return;
            }

            await Task.Delay(25);
        }

        Assert.Fail($"Timed out waiting for {what}.");
    }

    [Theory]
    [InlineData("terminalWrite", true)]
    [InlineData("terminalStart", true)]
    [InlineData("save", false)]
    [InlineData("tree", false)]
    public void Only_the_terminal_runs_beside_the_map(string command, bool alongside)
    {
        Assert.Equal(alongside, Commands.RunsAlongside(command));
    }

    [Fact]
    public async Task The_shells_found_are_listed()
    {
        var shells = (await Ask("terminalShells", new { })).GetProperty("result");

        Assert.Contains(shells.EnumerateArray(), shell => shell.GetProperty("id").GetString() == "cmd");
    }

    [Fact]
    public async Task A_terminal_starts_takes_what_is_typed_and_closes()
    {
        var started = (await Ask("terminalStart", new { shell = "cmd", columns = 120, rows = 30 })).GetProperty("result");
        var id = started.GetProperty("id").GetInt32();
        Assert.Equal("cmd", started.GetProperty("shell").GetString());

        await Ask("terminalWrite", new { id, text = "echo moon^well\r" });
        await Until(() => Seen().Contains("moonwell"), "the echo");

        await Ask("terminalResize", new { id, columns = 100, rows = 20 });
        await Ask("terminalClose", new { id });
        await Until(() => _exits == 1, "the exit");
    }

    [Fact]
    public async Task A_shell_no_longer_there_falls_back_to_the_default()
    {
        var started = (await Ask("terminalStart", new { shell = "gone", columns = 120, rows = 30 })).GetProperty("result");

        Assert.Equal(Shells.Found()[0].Id, started.GetProperty("shell").GetString());
        await Ask("terminalClose", new { id = started.GetProperty("id").GetInt32() });
        await Until(() => _exits == 1, "the exit");
    }

    [Fact]
    public void A_folder_map_opens_in_its_folder()
    {
        Assert.Equal(@"D:\Maps\Arena", Commands.TerminalFolder(@"D:\Maps\Arena", false, _ => true, Home));
    }

    [Fact]
    public void An_archive_opens_in_the_folder_it_sits_in()
    {
        Assert.Equal(@"D:\Maps", Commands.TerminalFolder(@"D:\Maps\Arena.w3x", true, _ => true, Home));
    }

    [Fact]
    public void With_no_map_it_opens_in_the_home_folder()
    {
        Assert.Equal(Home, Commands.TerminalFolder(null, false, _ => true, Home));
    }

    [Fact]
    public void A_map_folder_that_is_gone_opens_in_the_home_folder()
    {
        Assert.Equal(Home, Commands.TerminalFolder(@"D:\Maps\Arena", false, _ => false, Home));
    }
}
