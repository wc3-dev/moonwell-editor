using System.Text.Json.Serialization;
using MoonwellEditor.Files;

namespace MoonwellEditor.Model;

/// <summary>What game file a field names, which says how the page picks and shows it.</summary>
[JsonConverter(typeof(CamelCaseEnum<AssetKind>))]
public enum AssetKind
{
    /// <summary>An icon.</summary>
    Icon,

    /// <summary>A model.</summary>
    Model,

    /// <summary>A texture.</summary>
    Texture,
}
