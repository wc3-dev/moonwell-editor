using System.Text.Json;
using MoonwellEditor.Files;

namespace MoonwellEditor.App;

/// <summary>What the <c>terminalStart</c> command answers with.</summary>
/// <param name="Id">The new shell's id.</param>
/// <param name="Shell">Which shell runs, by id: the default when the one asked for is no longer on this PC.</param>
/// <param name="Name">Its name to show.</param>
public sealed record TerminalStarted(int Id, string Shell, string Name);

/// <summary>What a shell printed, sent with the <c>terminalOutput</c> event.</summary>
/// <param name="Id">The shell's id.</param>
/// <param name="Text">What it printed, with its colour codes.</param>
public sealed record TerminalOutput(int Id, string Text);

/// <summary>A shell that ended, sent with the <c>terminalExit</c> event.</summary>
/// <param name="Id">The shell's id.</param>
/// <param name="Code">Its exit code.</param>
public sealed record TerminalExit(int Id, int Code);

/// <summary>The terminal panel's commands. See <see cref="Terminals"/>.</summary>
public sealed partial class Commands
{
    /// <summary>The shells of the terminal panel.</summary>
    public Terminals Terminals { get; } = new();

    /// <summary>
    /// True for a command that does not wait for the one running: what is typed in a terminal must not sit behind a
    /// slow save. They touch no map, so they cannot get in the way of the commands that rely on running one at a time.
    /// </summary>
    /// <param name="command">The command's name.</param>
    /// <returns>Whether it runs beside the others.</returns>
    public static bool RunsAlongside(string command) => command.StartsWith("terminal", StringComparison.Ordinal);

    /// <summary>The folder a new terminal opens in: the map's own, or the one its archive sits in; else the home folder.</summary>
    /// <param name="map">The map's folder or archive file; null with no map open.</param>
    /// <param name="archive">True when it is an archive.</param>
    /// <param name="exists">Whether a folder is there.</param>
    /// <param name="home">The user's home folder.</param>
    /// <returns>The folder.</returns>
    public static string TerminalFolder(string? map, bool archive, Func<string, bool> exists, string home)
    {
        var folder = archive ? Path.GetDirectoryName(map) : map;
        return folder != null && exists(folder) ? folder : home;
    }

    private object? RunTerminal(string command, JsonElement args)
    {
        switch (command)
        {
            case "terminalShells":
                return Shells.Found();
            case "terminalStart":
                return StartTerminal(Text(args, "shell"), Number(args, "columns"), Number(args, "rows"));
            case "terminalWrite":
                Terminals.Write(Number(args, "id"), Text(args, "text"));
                return null;
            case "terminalResize":
                Terminals.Resize(Number(args, "id"), Number(args, "columns"), Number(args, "rows"));
                return null;
            case "terminalClose":
                Terminals.Close(Number(args, "id"));
                return null;
            default:
                throw new UnknownCommandException(command);
        }
    }

    private TerminalStarted StartTerminal(string shellId, int columns, int rows)
    {
        var shells = Shells.Found();
        var shell = shells.FirstOrDefault(each => each.Id == shellId) ?? shells.FirstOrDefault()
            ?? throw new CommandException("noShell", Texts.Get("app.terminal.noShell"));
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var store = _store;
        var folder = TerminalFolder(store?.Path, store?.IsArchive ?? false, Directory.Exists, home);
        return new TerminalStarted(Terminals.Start(shell, folder, columns, rows), shell.Id, shell.Name);
    }
}
