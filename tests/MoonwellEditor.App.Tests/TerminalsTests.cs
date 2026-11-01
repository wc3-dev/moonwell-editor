using System.Collections.Concurrent;
using System.Text;
using MoonwellEditor.App;

namespace MoonwellEditor.App.Tests;

/// <summary>These run a real <c>cmd.exe</c> in a real pseudo console, as the panel does.</summary>
public sealed class TerminalsTests : IDisposable
{
    private static readonly Shell Cmd = new("cmd", "Command Prompt", Environment.GetEnvironmentVariable("ComSpec")!, "");

    private readonly string _folder = Path.Combine(Path.GetTempPath(), "MoonwellEditor.App.Tests", Guid.NewGuid().ToString("N"));
    private readonly Terminals _terminals = new();
    private readonly StringBuilder _output = new();
    private readonly ConcurrentDictionary<int, int> _exits = new();
    private readonly List<int> _started = [];

    public TerminalsTests()
    {
        Directory.CreateDirectory(_folder);
        _terminals.Output += (_, text) =>
        {
            lock (_output)
            {
                _output.Append(text);
            }
        };
        _terminals.Exited += (id, code) => _exits[id] = code;
    }

    public void Dispose()
    {
        _terminals.Dispose();

        // A shell holds on to the folder it runs in until it has ended.
        SpinWait.SpinUntil(() => _started.All(_exits.ContainsKey), 15000);
        Directory.Delete(_folder, true);
    }

    private int Start(int columns = 120, int rows = 30)
    {
        var id = _terminals.Start(Cmd, _folder, columns, rows);
        _started.Add(id);
        return id;
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

    [Fact]
    public async Task A_shell_starts_in_the_folder_given()
    {
        var id = Start(200);

        _terminals.Write(id, "cd\r");

        await Until(() => Seen().Contains(Path.GetFileName(_folder)), "the folder in the output");
    }

    [Fact]
    public async Task What_is_written_runs_and_its_output_comes_back()
    {
        var id = Start();

        _terminals.Write(id, "echo moon^well\r");

        await Until(() => Seen().Contains("moonwell"), "the echo");
    }

    [Fact]
    public async Task Text_outside_ascii_comes_back_whole()
    {
        var id = Start();

        _terminals.Write(id, "chcp 65001 >nul & echo Rosé Pine\r");

        await Until(() => Seen().Contains("Rosé Pine"), "the text");
    }

    [Fact]
    public async Task A_shell_that_ends_says_so_with_its_exit_code()
    {
        var id = Start();

        _terminals.Write(id, "exit 3\r");

        await Until(() => _exits.ContainsKey(id), "the exit");
        Assert.Equal(3, _exits[id]);
    }

    [Fact]
    public async Task A_new_size_reaches_the_shell()
    {
        var id = Start();

        _terminals.Resize(id, 133, 40);
        _terminals.Write(id, "mode con\r");

        await Until(() => Seen().Contains("133"), "the new width");
    }

    [Fact]
    public async Task Closing_ends_the_shell()
    {
        var id = Start();

        _terminals.Close(id);

        await Until(() => _exits.ContainsKey(id), "the exit");
    }

    [Fact]
    public async Task Closing_all_ends_every_shell()
    {
        var first = Start();
        var second = Start();

        _terminals.CloseAll();

        await Until(() => _exits.ContainsKey(first) && _exits.ContainsKey(second), "both exits");
    }

    [Fact]
    public void Writing_to_a_shell_that_is_gone_does_nothing()
    {
        var id = Start();
        _terminals.Close(id);

        _terminals.Write(id, "echo too late\r");
        _terminals.Resize(id, 80, 20);
        _terminals.Write(12345, "nobody\r");
    }

    [Fact]
    public void Shells_have_ids_of_their_own()
    {
        Assert.NotEqual(Start(), Start());
    }
}
