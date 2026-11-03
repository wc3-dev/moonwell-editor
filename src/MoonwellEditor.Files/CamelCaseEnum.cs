using System.Text.Json;
using System.Text.Json.Serialization;

namespace MoonwellEditor.Files;

/// <summary>
/// Writes and reads an enum as its name in camelCase (<c>startLocation</c>), as a value and as a dictionary's key. It
/// reads only that exact text: not another case, not a number (System.Text.Json's own enum converter takes both). The
/// page's kinds and codes are written this way: <c>[JsonConverter(typeof(CamelCaseEnum&lt;T&gt;))]</c> on the enum.
/// </summary>
/// <typeparam name="T">The enum.</typeparam>
public sealed class CamelCaseEnum<T> : JsonConverter<T>
    where T : struct, Enum
{
    private static readonly Dictionary<T, string> Names =
        Enum.GetValues<T>().ToDictionary(value => value, value => JsonNamingPolicy.CamelCase.ConvertName(value.ToString()));

    private static readonly Dictionary<string, T> Values =
        Names.ToDictionary(pair => pair.Value, pair => pair.Key, StringComparer.Ordinal);

    /// <inheritdoc/>
    public override T Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.String
            ? ValueOf(reader.GetString())
            : throw new JsonException($"A {typeof(T).Name} is written as text, not as {reader.TokenType}.");

    /// <inheritdoc/>
    public override void Write(Utf8JsonWriter writer, T value, JsonSerializerOptions options) =>
        writer.WriteStringValue(Names[value]);

    /// <inheritdoc/>
    public override T ReadAsPropertyName(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        ValueOf(reader.GetString());

    /// <inheritdoc/>
    public override void WriteAsPropertyName(Utf8JsonWriter writer, T value, JsonSerializerOptions options) =>
        writer.WritePropertyName(Names[value]);

    private static T ValueOf(string? text) =>
        text != null && Values.TryGetValue(text, out var value)
            ? value
            : throw new JsonException($"\"{text}\" is not a {typeof(T).Name}.");
}
