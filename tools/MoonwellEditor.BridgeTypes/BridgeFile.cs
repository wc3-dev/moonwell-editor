using System.Reflection;
using MoonwellEditor.App;
using MoonwellEditor.Model;

namespace MoonwellEditor.BridgeTypes;

/// <summary>The page's <c>bridge.gen.ts</c>, made from the app's own commands, events and options.</summary>
public static class BridgeFile
{
    /// <summary>What crosses the bridge: the command table, the events, the error codes and the boot script.</summary>
    /// <returns>The shape.</returns>
    public static BridgeShape Shape() => new(
        [
            .. Commands.Table.Select(entry =>
                new CommandShape(entry.Name, entry.Args, entry.Answer, entry.AnswerNullable, entry.Told)),
        ],
        [.. BridgeEvents.All.Select(each => new EventShape(each.Name, each.Payload))],
        typeof(ErrorCode),
        [typeof(HomeBoot)]);

    /// <summary>The file's text, with the docs of the editor's and Moonwell's assemblies.</summary>
    /// <returns>The text.</returns>
    public static string Write() =>
        TypeScriptWriter.Write(Shape(), BridgeJson.Answers, BridgeJson.Arguments, DocComments.Load(Assemblies()));

    private static IEnumerable<Assembly> Assemblies()
    {
        var app = typeof(Commands).Assembly;
        return
        [
            app,
            .. app.GetReferencedAssemblies()
                .Where(name => name.Name is { } each && (each.StartsWith("MoonwellEditor.", StringComparison.Ordinal)
                    || each.StartsWith("Moonwell.", StringComparison.Ordinal)))
                .Select(Assembly.Load),
        ];
    }
}
