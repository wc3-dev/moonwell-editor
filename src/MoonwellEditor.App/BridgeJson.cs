using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace MoonwellEditor.App;

/// <summary>The options the bridge writes with, which the page's generated types are read from too.</summary>
public static class BridgeJson
{
    /// <summary>The options for answers and events: camelCase, kinds of object by their keys.</summary>
    public static JsonSerializerOptions Answers { get; } = new(JsonSerializerDefaults.Web)
    {
        TypeInfoResolver = new DefaultJsonTypeInfoResolver(),
        Converters = { new ObjectKindConverter() },
    };

    /// <summary>
    /// The options for a command's arguments: as <see cref="Answers"/>, but strict. Names match exactly, numbers are JSON
    /// numbers, a missing argument with no default and a <c>null</c> where the record takes none are refused.
    /// </summary>
    public static JsonSerializerOptions Arguments { get; } = new(JsonSerializerDefaults.Web)
    {
        TypeInfoResolver = new DefaultJsonTypeInfoResolver(),
        Converters = { new ObjectKindConverter() },
        PropertyNameCaseInsensitive = false,
        NumberHandling = JsonNumberHandling.Strict,
        RespectNullableAnnotations = true,
        RespectRequiredConstructorParameters = true,
    };
}
