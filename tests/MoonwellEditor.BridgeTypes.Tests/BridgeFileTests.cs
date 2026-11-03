using MoonwellEditor.App;

namespace MoonwellEditor.BridgeTypes.Tests;

public sealed class BridgeFileTests
{
    [Fact]
    public void The_committed_file_is_up_to_date()
    {
        var committed = File.ReadAllText(Path.Combine(RepositoryRoot(), "web", "src", "lib", "bridge.gen.ts"))
            .Replace("\r\n", "\n", StringComparison.Ordinal);

        Assert.True(committed == BridgeFile.Write(), "bridge.gen.ts is out of date: run npm run types in web");
    }

    [Fact]
    public void The_shape_has_every_command_and_event()
    {
        var shape = BridgeFile.Shape();

        Assert.Equal(Commands.Table.Count, shape.Commands.Count);
        Assert.Equal(7, shape.Events.Count);
        Assert.Contains(shape.Commands, command => command is { Name: "openMap", AnswerNullable: true });
        Assert.Contains(shape.Commands, command => command is { Name: "terminalWrite", Told: true });
    }

    private static string RepositoryRoot()
    {
        for (var folder = new DirectoryInfo(AppContext.BaseDirectory); folder != null; folder = folder.Parent)
        {
            if (File.Exists(Path.Combine(folder.FullName, "MoonwellEditor.slnx")))
            {
                return folder.FullName;
            }
        }

        throw new DirectoryNotFoundException("No MoonwellEditor.slnx above " + AppContext.BaseDirectory);
    }
}
