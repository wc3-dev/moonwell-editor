using System.Text.Json.Serialization;
using War3Net.Build.Environment;

namespace MoonwellEditor.Map;

/// <summary>What a ground brush does to the corners under it; it goes to and from the page by its name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<GroundTool>))]
public enum GroundTool
{
    /// <summary>Gives the corners a tile.</summary>
    Paint,

    /// <summary>Raises the ground, most in the brush's middle.</summary>
    Raise,

    /// <summary>Lowers the ground, most in the brush's middle.</summary>
    Lower,

    /// <summary>Brings the ground to the height where the stroke began.</summary>
    Plateau,

    /// <summary>Evens the ground out toward its neighbours' height.</summary>
    Smooth,
}

/// <summary>A brush's outline; it goes to and from the page by its name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<BrushShape>))]
public enum BrushShape
{
    /// <summary>A round brush.</summary>
    Circle,

    /// <summary>A square brush.</summary>
    Square,
}

/// <summary>A ground brush.</summary>
/// <param name="Shape">Its outline.</param>
/// <param name="Size">How many corners across it is, 1 to 8.</param>
/// <param name="Strength">How far a raise or lower moves the ground in the brush's middle at each step, in game units.</param>
public sealed record Brush(BrushShape Shape, int Size, float Strength);

/// <summary>
/// The ground brushes' rules (the editor's own, after World Editor's palette): a brush covers the corners within its
/// outline around the corner nearest the mouse (an odd size) or the middle of the tile under it (an even size).
/// </summary>
public static class GroundTools
{
    /// <summary>The largest brush.</summary>
    public const int Largest = 8;

    // The heights a corner can hold: War3Net's Height for the file's 0 to 16383.
    private const float Lowest = -16f;
    private const float Highest = 16383f / 512f - 16f;

    /// <summary>
    /// The corners <paramref name="brush"/> covers at <paramref name="x"/>, <paramref name="y"/>, each with its weight:
    /// 1 in the middle, falling toward 0 at the outline.
    /// </summary>
    public static IEnumerable<(int Column, int Row, float Weight)> Covered(MapEnvironment terrain, float x, float y, Brush brush)
    {
        var size = Math.Clamp(brush.Size, 1, Largest);
        var u = (x - terrain.Left) / 128f;
        var v = (y - terrain.Bottom) / 128f;
        var (cu, cv) = size % 2 == 1 ? (MathF.Round(u), MathF.Round(v)) : (MathF.Floor(u) + 0.5f, MathF.Floor(v) + 0.5f);
        var reach = (size - 1) / 2f;
        var radius = size / 2f;

        // The middle corners are full strength: the one at the middle of an odd brush, the four around an even one's.
        var middle = size % 2 == 1 ? 0f : MathF.Sqrt(0.5f);
        for (var row = (int)MathF.Ceiling(cv - reach); row <= (int)MathF.Floor(cv + reach); row++)
        {
            for (var column = (int)MathF.Ceiling(cu - reach); column <= (int)MathF.Floor(cu + reach); column++)
            {
                if (column < 0 || row < 0 || column > terrain.Width || row > terrain.Height)
                {
                    continue;
                }

                var distance = MathF.Sqrt(((column - cu) * (column - cu)) + ((row - cv) * (row - cv)));
                if (brush.Shape == BrushShape.Circle && distance > radius)
                {
                    continue;
                }

                var cosine = MathF.Cos(MathF.PI / 2f * (distance - middle) / (radius + 0.5f - middle));
                yield return (column, row, cosine * cosine);
            }
        }
    }

    /// <summary>
    /// Uses <paramref name="tool"/> once at <paramref name="x"/>, <paramref name="y"/>. A paint gives the corners
    /// tile <paramref name="texture"/> (its number in the map's list); a plateau brings them to
    /// <paramref name="plateau"/> (a corner's Height). Each corner is passed to <paramref name="changing"/> before it
    /// changes.
    /// </summary>
    public static void Use(
        MapEnvironment terrain, GroundTool tool, float x, float y, Brush brush, int texture, float plateau, Action<int> changing)
    {
        var columns = (int)terrain.Width + 1;
        var corners = terrain.TerrainTiles;
        var covered = Covered(terrain, x, y, brush).ToList();
        var before = tool == GroundTool.Smooth ? covered.ToDictionary(c => (c.Column, c.Row), c => Around(terrain, c.Column, c.Row)) : null;
        foreach (var (column, row, weight) in covered)
        {
            var index = (row * columns) + column;
            var corner = corners[index];
            var height = tool switch
            {
                GroundTool.Raise => corner.Height + (brush.Strength / 128f * weight),
                GroundTool.Lower => corner.Height - (brush.Strength / 128f * weight),
                GroundTool.Plateau => plateau,
                GroundTool.Smooth => corner.Height + ((before![(column, row)] - corner.Height) * 0.5f * weight),
                _ => corner.Height,
            };
            height = Math.Clamp(height, Lowest, Highest);
            if (tool == GroundTool.Paint ? corner.Texture == texture : corner.Height == height)
            {
                continue;
            }

            changing(index);
            if (tool == GroundTool.Paint)
            {
                corner.Texture = texture;
            }
            else
            {
                corner.Height = height;
            }
        }
    }

    // The average Height of a corner and the up to eight around it.
    private static float Around(MapEnvironment terrain, int column, int row)
    {
        var columns = (int)terrain.Width + 1;
        var (sum, count) = (0f, 0);
        for (var j = Math.Max(row - 1, 0); j <= Math.Min(row + 1, (int)terrain.Height); j++)
        {
            for (var i = Math.Max(column - 1, 0); i <= Math.Min(column + 1, (int)terrain.Width); i++)
            {
                sum += terrain.TerrainTiles[(j * columns) + i].Height;
                count++;
            }
        }

        return sum / count;
    }
}
