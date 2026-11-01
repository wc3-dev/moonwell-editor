using System.Text;

namespace MoonwellEditor.App;

/// <summary>
/// The shells running in the terminal panel (Sven, 2026-11-01), by id. It knows nothing of the page: the window passes
/// its events on, and each shell is read on a thread of its own, so a shell that prints a lot holds up nothing else.
/// </summary>
public sealed class Terminals : IDisposable
{
    private readonly object _lock = new();
    private readonly Dictionary<int, ConsoleProcess> _running = [];
    private int _nextId = 1;

    /// <summary>Raised, on a background thread, with a shell's id and what it printed.</summary>
    public event Action<int, string>? Output;

    /// <summary>Raised, on a background thread, with a shell's id and exit code once it has ended.</summary>
    public event Action<int, int>? Exited;

    /// <summary>Starts a shell.</summary>
    /// <param name="shell">The shell.</param>
    /// <param name="folder">The folder it starts in.</param>
    /// <param name="columns">Its width in characters.</param>
    /// <param name="rows">Its height in lines.</param>
    /// <returns>The shell's id.</returns>
    public int Start(Shell shell, string folder, int columns, int rows)
    {
        var commandLine = shell.Arguments.Length == 0 ? $"\"{shell.Path}\"" : $"\"{shell.Path}\" {shell.Arguments}";
        var process = ConsoleProcess.Start(commandLine, folder, columns, rows);
        int id;
        lock (_lock)
        {
            id = _nextId++;
            _running[id] = process;
        }

        var reader = new Thread(() => Read(id, process)) { IsBackground = true, Name = $"Terminal {id} output" };
        reader.Start();
        new Thread(() => Follow(id, process, reader)) { IsBackground = true, Name = $"Terminal {id}" }.Start();
        return id;
    }

    /// <summary>Sends what was typed to a shell. A shell that has ended takes nothing.</summary>
    /// <param name="id">The shell's id.</param>
    /// <param name="text">What was typed.</param>
    public void Write(int id, string text)
    {
        try
        {
            if (Find(id) is { } process)
            {
                process.Input.Write(Encoding.UTF8.GetBytes(text));
                process.Input.Flush();
            }
        }
        catch (Exception exception) when (exception is IOException or ObjectDisposedException)
        {
            // It ended while this was on its way.
        }
    }

    /// <summary>Tells a shell its new size.</summary>
    /// <param name="id">The shell's id.</param>
    /// <param name="columns">Its width in characters.</param>
    /// <param name="rows">Its height in lines.</param>
    public void Resize(int id, int columns, int rows) => Find(id)?.Resize(columns, rows);

    /// <summary>Starts ending a shell and what runs in it, without waiting for that.</summary>
    /// <param name="id">The shell's id.</param>
    public void Close(int id)
    {
        if (Find(id) is { } process)
        {
            Task.Run(process.End);
        }
    }

    /// <summary>Ends every shell, and returns once they have ended, so none outlives the window.</summary>
    public void CloseAll()
    {
        List<ConsoleProcess> all;
        lock (_lock)
        {
            all = [.. _running.Values];
        }

        Parallel.ForEach(all, process => process.End());
    }

    /// <inheritdoc />
    public void Dispose() => CloseAll();

    private ConsoleProcess? Find(int id)
    {
        lock (_lock)
        {
            return _running.GetValueOrDefault(id);
        }
    }

    private void Read(int id, ConsoleProcess process)
    {
        var bytes = new byte[16 * 1024];
        var chars = new char[bytes.Length + 1];

        // A character can be cut in two by the end of a read: the decoder keeps its first half for the next one.
        var decoder = Encoding.UTF8.GetDecoder();
        try
        {
            int read;
            while ((read = process.Output.Read(bytes)) > 0)
            {
                var count = decoder.GetChars(bytes, 0, read, chars, 0);
                if (count > 0)
                {
                    Output?.Invoke(id, new string(chars, 0, count));
                }
            }
        }
        catch (Exception exception) when (exception is IOException or ObjectDisposedException)
        {
            // The pipe closes with the console.
        }
    }

    private void Follow(int id, ConsoleProcess process, Thread reader)
    {
        var code = process.WaitForExit();
        process.CloseConsole();
        reader.Join();
        lock (_lock)
        {
            _running.Remove(id);
        }

        process.Dispose();
        Exited?.Invoke(id, code);
    }
}
