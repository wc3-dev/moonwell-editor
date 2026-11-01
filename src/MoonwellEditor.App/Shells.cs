using MoonwellEditor.Files;

namespace MoonwellEditor.App;

/// <summary>A shell the terminal panel can run.</summary>
/// <param name="Id">What the settings remember it by (<c>pwsh</c>).</param>
/// <param name="Name">Its name to show.</param>
/// <param name="Path">Its program.</param>
/// <param name="Arguments">What it starts with, as a command line.</param>
public sealed record Shell(string Id, string Name, string Path, string Arguments);

/// <summary>
/// The shells on this PC (Sven, 2026-11-01), the one a new terminal runs by default first: PowerShell 7 if it is
/// installed, else Windows PowerShell, then Command Prompt and Git Bash. Windows' own <c>bash.exe</c> is WSL's, so Git
/// Bash is looked for where Git puts it.
/// </summary>
public static class Shells
{
    /// <summary>The shells on this PC.</summary>
    /// <returns>The shells found, the default first.</returns>
    public static IReadOnlyList<Shell> Found() => Found(File.Exists, Environment.GetEnvironmentVariable);

    /// <summary>The shells found by the given checks, so the search can be tested.</summary>
    /// <param name="exists">Whether a file is there.</param>
    /// <param name="variable">An environment variable's value.</param>
    /// <returns>The shells found, the default first.</returns>
    public static IReadOnlyList<Shell> Found(Func<string, bool> exists, Func<string, string?> variable)
    {
        var folders = (variable("PATH") ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        string? OnPath(string file) => folders.Select(folder => Path.Combine(folder, file)).FirstOrDefault(exists);
        string? Under(string root, params string[] parts) =>
            variable(root) is { Length: > 0 } folder ? Path.Combine([folder, .. parts]) : null;
        string? First(params string?[] files) => files.FirstOrDefault(file => file != null && exists(file));

        var git = OnPath("git.exe");
        var gitRoot = git == null ? null : Path.GetDirectoryName(Path.GetDirectoryName(git));

        var shells = new List<Shell>();
        void Add(string id, string? path, string arguments)
        {
            if (path != null)
            {
                shells.Add(new Shell(id, Texts.Get($"app.terminal.{id}"), path, arguments));
            }
        }

        Add("pwsh", First(Under("ProgramFiles", "PowerShell", "7", "pwsh.exe")) ?? OnPath("pwsh.exe"), "-NoLogo");
        Add("powershell", First(Under("SystemRoot", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")), "-NoLogo");
        Add("cmd", First(variable("ComSpec")), "");
        Add(
            "bash",
            First(
                Under("ProgramFiles", "Git", "bin", "bash.exe"),
                Under("ProgramFiles(x86)", "Git", "bin", "bash.exe"),
                Under("LOCALAPPDATA", "Programs", "Git", "bin", "bash.exe"),
                gitRoot == null ? null : Path.Combine(gitRoot, "bin", "bash.exe")),
            "--login -i");
        return shells;
    }
}
