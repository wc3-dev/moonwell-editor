using MoonwellEditor.App;

namespace MoonwellEditor.App.Tests;

public sealed class ShellsTests
{
    private const string Pwsh = @"C:\Program Files\PowerShell\7\pwsh.exe";
    private const string WindowsPowerShell = @"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
    private const string Cmd = @"C:\Windows\System32\cmd.exe";
    private const string GitBash = @"C:\Program Files\Git\bin\bash.exe";

    private static readonly Dictionary<string, string> Variables = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ProgramFiles"] = @"C:\Program Files",
        ["ProgramFiles(x86)"] = @"C:\Program Files (x86)",
        ["SystemRoot"] = @"C:\Windows",
        ["ComSpec"] = Cmd,
        ["LOCALAPPDATA"] = @"C:\Users\Someone\AppData\Local",
        ["PATH"] = "",
    };

    private static IReadOnlyList<Shell> Found(string[] files, string path = "")
    {
        var variables = new Dictionary<string, string>(Variables, StringComparer.OrdinalIgnoreCase) { ["PATH"] = path };
        return Shells.Found(
            file => files.Contains(file, StringComparer.OrdinalIgnoreCase),
            name => variables.GetValueOrDefault(name));
    }

    [Fact]
    public void PowerShell_7_comes_first_when_it_is_installed()
    {
        var shells = Found([Pwsh, WindowsPowerShell, Cmd, GitBash]);

        Assert.Equal(["pwsh", "powershell", "cmd", "bash"], shells.Select(shell => shell.Id));
        Assert.Equal(Pwsh, shells[0].Path);
        Assert.Equal(GitBash, shells[3].Path);
    }

    [Fact]
    public void Windows_PowerShell_comes_first_without_PowerShell_7()
    {
        var shells = Found([WindowsPowerShell, Cmd]);

        Assert.Equal(["powershell", "cmd"], shells.Select(shell => shell.Id));
    }

    [Fact]
    public void PowerShell_7_is_found_on_the_path()
    {
        var shells = Found([@"D:\Tools\pwsh.exe", Cmd], @"C:\Nothing;D:\Tools");

        Assert.Equal(@"D:\Tools\pwsh.exe", shells[0].Path);
    }

    [Fact]
    public void Git_Bash_is_found_beside_the_git_on_the_path()
    {
        var shells = Found([@"D:\Git\cmd\git.exe", @"D:\Git\bin\bash.exe", Cmd], @"D:\Git\cmd");

        Assert.Equal(@"D:\Git\bin\bash.exe", shells.Single(shell => shell.Id == "bash").Path);
    }

    [Fact]
    public void Windows_own_bash_is_not_taken_for_Git_Bash()
    {
        var shells = Found([@"C:\Windows\System32\bash.exe", Cmd], @"C:\Windows\System32");

        Assert.DoesNotContain(shells, shell => shell.Id == "bash");
    }

    [Fact]
    public void A_shell_that_is_not_there_is_left_out()
    {
        Assert.Equal(["cmd"], Found([Cmd]).Select(shell => shell.Id));
    }

    [Fact]
    public void This_computer_has_a_shell()
    {
        Assert.NotEmpty(Shells.Found());
    }
}
