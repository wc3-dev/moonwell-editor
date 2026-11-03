using System.Text.Json;
using MoonwellEditor.App;
using MoonwellEditor.Map;
using MoonwellEditor.Model;
using ObjectKind = Moonwell.GameData.Kind;

namespace MoonwellEditor.App.Tests;

public sealed class BridgeJsonTests
{
    private static string Write<T>(T value) => JsonSerializer.Serialize(value, BridgeJson.Answers);

    [Fact]
    public void An_object_kind_is_written_by_its_key() => Assert.Equal("\"unit\"", Write(ObjectKind.Unit));

    [Fact]
    public void An_object_kind_key_in_a_dictionary_is_its_key() =>
        Assert.Equal("{\"unit\":1}", Write(new Dictionary<ObjectKind, int> { [ObjectKind.Unit] = 1 }));

    [Fact]
    public void An_object_kind_is_read_from_its_key() =>
        Assert.Equal(ObjectKind.Ability, JsonSerializer.Deserialize<ObjectKind>("\"ability\"", BridgeJson.Answers));

    [Theory]
    [InlineData("\"Unit\"")]
    [InlineData("0")]
    [InlineData("\"nope\"")]
    public void An_object_kind_by_name_or_number_is_refused(string json) =>
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<ObjectKind>(json, BridgeJson.Answers));

    [Fact]
    public void An_asset_kind_is_camel_case() => Assert.Equal("\"texture\"", Write(AssetKind.Texture));

    [Fact]
    public void Thing_kind_keeps_its_name() => Assert.Equal("\"StartLocation\"", Write(ThingKind.StartLocation));
}
