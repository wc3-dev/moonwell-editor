using System.Text.Json;
using System.Text.Json.Serialization;

namespace MoonwellEditor.App;

/// <summary>
/// Writes and reads a kind of object by its key (<c>unit</c>, <see cref="Kinds.Key"/>), as a value and as a dictionary's
/// key. Moonwell's enum cannot carry an attribute of the editor's, so the bridge's options hold this.
/// </summary>
public sealed class ObjectKindConverter : JsonConverter<ObjectKind>
{
    /// <inheritdoc/>
    public override ObjectKind Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.String ? FromKey(reader.GetString()) : throw NotAKind(reader.TokenType.ToString());

    /// <inheritdoc/>
    public override void Write(Utf8JsonWriter writer, ObjectKind value, JsonSerializerOptions options) =>
        writer.WriteStringValue(Kinds.Key(value));

    /// <inheritdoc/>
    public override ObjectKind ReadAsPropertyName(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        FromKey(reader.GetString());

    /// <inheritdoc/>
    public override void WriteAsPropertyName(Utf8JsonWriter writer, ObjectKind value, JsonSerializerOptions options) =>
        writer.WritePropertyName(Kinds.Key(value));

    private static ObjectKind FromKey(string? key) => Kinds.FromKey(key ?? "") ?? throw NotAKind($"\"{key}\"");

    private static JsonException NotAKind(string what) => new($"{what} is not a kind of object.");
}
