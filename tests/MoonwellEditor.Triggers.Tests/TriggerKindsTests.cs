using System.Text.Json;
using MoonwellEditor.Triggers;

namespace MoonwellEditor.Triggers.Tests;

public sealed class TriggerKindsTests
{
    private static string[] Written<T>()
        where T : struct, Enum =>
        [.. Enum.GetValues<T>().Select(value => JsonSerializer.Serialize(value).Trim('"'))];

    [Fact]
    public void Each_kind_is_written_as_today()
    {
        Assert.Equal(["root", "category", "trigger", "custom", "script", "comment", "variable"], Written<TriggerItemKind>());
        Assert.Equal(["event", "condition", "action", "call"], Written<FunctionKind>());
        Assert.Equal(["preset", "variable", "function", "value", "none"], Written<ParameterKind>());
        Assert.Equal(["condition", "action"], Written<BlockKind>());
        Assert.Equal(["jass", "lua"], Written<MapLanguage>());
    }
}
