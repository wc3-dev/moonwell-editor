using System.Text.Json;
using MoonwellEditor.Model;

namespace MoonwellEditor.Model.Tests;

public sealed class ErrorCodeTests
{
    [Fact]
    public void Every_code_is_written_as_today()
    {
        var written = Enum.GetValues<ErrorCode>().Select(code => JsonSerializer.Serialize(code)).ToList();

        Assert.Equal(
            [
                "\"noObject\"", "\"noField\"", "\"notNumber\"", "\"badValue\"", "\"idTaken\"", "\"idInvalid\"",
                "\"readOnly\"", "\"badText\"", "\"changedOnDisk\"", "\"mapFile\"", "\"noMap\"", "\"unsaved\"",
                "\"unknownCommand\"", "\"badRequest\"", "\"failed\"", "\"gameDataMissing\"", "\"gameDataLoading\"",
                "\"gameDataFailed\"", "\"triggerEdit\"", "\"noAssets\"", "\"noShell\"",
            ],
            written);
    }
}
