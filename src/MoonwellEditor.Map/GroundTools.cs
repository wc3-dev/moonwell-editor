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

    /// <summary>Makes the corners a cliff level higher than where the stroke began, in the cliff type chosen.</summary>
    CliffUp,

    /// <summary>Makes the corners a cliff level lower than where the stroke began, in the cliff type chosen.</summary>
    CliffDown,

    /// <summary>Brings the corners to the cliff level where the stroke began, in the cliff type chosen.</summary>
    CliffLevel,

    /// <summary>Flags the corners as a ramp's: three rows across a cliff of one level make a ramp up it.</summary>
    Ramp,

    /// <summary>
    /// Makes the corners shallow water: a cliff level down, under water standing as World Editor's does below the
    /// ground where the stroke began (38.4 deep there).
    /// </summary>
    ShallowWater,

    /// <summary>Makes the corners deep water: two cliff levels down, under the same water (166.4 deep there).</summary>
    DeepWater,
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
/// <param name="Size">1 to 8, as World Editor's: 2 × Size − 1 corners across.</param>
/// <param name="Strength">How far a raise or lower moves the ground in the brush's middle at each step, in game units.</param>
public sealed record Brush(BrushShape Shape, int Size, float Strength);

/// <summary>What the steps of one stroke share, worked out where it began.</summary>
/// <param name="Texture">The tile a paint gives: its number in the map's list; -1 for the other tools.</param>
/// <param name="Plateau">The Height where the stroke began: what a plateau brings the corners to.</param>
/// <param name="Level">
/// The cliff level the stroke began on; in water, the land's: the water's height above the corner's Height, + 2.
/// </param>
/// <param name="CliffType">The cliff type a cliff tool gives the corners: its number in the map's list.</param>
public sealed record StrokeStart(int Texture, float Plateau, int Level, int CliffType);

/// <summary>
/// The ground brushes' rules (the editor's own, after World Editor's palette): a brush covers the corners within its
/// outline around the corner nearest the mouse, 2 × size − 1 corners across as World Editor's. The
/// cliff and water tools set a cliff level, and the corners around follow so that no tile spans more than two levels,
/// the most the cliff models cover (their letters go to C).
/// </summary>
public static class GroundTools
{
    /// <summary>The largest brush.</summary>
    public const int Largest = 8;

    // The heights a corner can hold: War3Net's Height for the file's 0 to 16383.
    private const float Lowest = -16f;
    private const float Highest = 16383f / 512f - 16f;

    // The cliff levels a corner can hold, and the most a tile's corners may differ.
    private const int HighestLevel = 15;
    private const int Spread = 2;

    /// <summary>Whether <paramref name="tool"/> changes cliff levels, ramps or water, so the cliff models change.</summary>
    public static bool ChangesCliffs(GroundTool tool) => tool >= GroundTool.CliffUp;

    /// <summary>
    /// The corners <paramref name="brush"/> covers at <paramref name="x"/>, <paramref name="y"/>, each with its weight:
    /// 1 in the middle, falling toward 0 at the outline.
    /// </summary>
    public static IEnumerable<(int Column, int Row, float Weight)> Covered(MapEnvironment terrain, float x, float y, Brush brush)
    {
        var across = (2 * Math.Clamp(brush.Size, 1, Largest)) - 1;
        var cu = MathF.Round((x - terrain.Left) / 128f);
        var cv = MathF.Round((y - terrain.Bottom) / 128f);
        var reach = (across - 1) / 2f;
        var radius = across / 2f;
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

                var cosine = MathF.Cos(MathF.PI / 2f * distance / (radius + 0.5f));
                yield return (column, row, cosine * cosine);
            }
        }
    }

    /// <summary>
    /// Uses <paramref name="tool"/> once at <paramref name="x"/>, <paramref name="y"/>, with what the stroke began on.
    /// Each corner is passed to <paramref name="changing"/> before it changes.
    /// </summary>
    public static void Use(
        MapEnvironment terrain, GroundTool tool, float x, float y, Brush brush, StrokeStart start, Action<int> changing)
    {
        var columns = (int)terrain.Width + 1;
        var corners = terrain.TerrainTiles;
        var covered = Covered(terrain, x, y, brush).ToList();
        if (ChangesCliffs(tool))
        {
            UseCliff(terrain, tool, covered.Select(c => (c.Row * columns) + c.Column), start, changing);
            return;
        }

        var (texture, plateau) = (start.Texture, start.Plateau);
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

    // A cliff or water tool on the corners at `indices`; then the corners around follow (see Follow).
    private static void UseCliff(
        MapEnvironment terrain, GroundTool tool, IEnumerable<int> indices, StrokeStart start, Action<int> changing)
    {
        var corners = terrain.TerrainTiles;
        var moved = new Queue<int>();
        foreach (var index in indices)
        {
            var corner = corners[index];
            if (tool == GroundTool.Ramp)
            {
                if (!corner.IsRamp && RampFits(terrain, index))
                {
                    changing(index);
                    corner.IsRamp = true;
                }

                continue;
            }

            var water = tool is GroundTool.ShallowWater or GroundTool.DeepWater;
            var step = tool switch
            {
                GroundTool.CliffUp => 1,
                GroundTool.CliffDown or GroundTool.ShallowWater => -1,
                GroundTool.DeepWater => -2,
                _ => 0,
            };
            var level = Math.Clamp(start.Level + step, 0, HighestLevel);

            // The water's surface, in Height's units: the ground where the stroke began, so the tileset's water level
            // (−89.6) puts it below that ground as World Editor's is below level 2's.
            var surface = start.Plateau + start.Level - 2f;
            var same = corner.CliffLevel == level && !corner.IsRamp && corner.IsWater == water
                && (water ? corner.WaterHeight == surface : corner.CliffTexture == start.CliffType);
            if (same)
            {
                continue;
            }

            changing(index);
            corner.CliffLevel = level;
            corner.IsRamp = false;
            corner.IsWater = water;
            if (water)
            {
                corner.WaterHeight = surface;
            }
            else
            {
                corner.CliffTexture = start.CliffType;
            }

            moved.Enqueue(index);
        }

        Follow(terrain, moved, changing);
    }

    // Moves the corners around each moved one toward its level, so that no two corners of a tile are more than Spread
    // levels apart; each corner moved in turn moves those around it.
    private static void Follow(MapEnvironment terrain, Queue<int> moved, Action<int> changing)
    {
        var columns = (int)terrain.Width + 1;
        var corners = terrain.TerrainTiles;
        while (moved.Count > 0)
        {
            var index = moved.Dequeue();
            var level = corners[index].CliffLevel;
            var (column, row) = (index % columns, index / columns);
            for (var j = Math.Max(row - 1, 0); j <= Math.Min(row + 1, (int)terrain.Height); j++)
            {
                for (var i = Math.Max(column - 1, 0); i <= Math.Min(column + 1, (int)terrain.Width); i++)
                {
                    var around = (j * columns) + i;
                    var corner = corners[around];
                    var bounded = Math.Clamp(corner.CliffLevel, level - Spread, level + Spread);
                    if (bounded != corner.CliffLevel)
                    {
                        changing(around);
                        corner.CliffLevel = bounded;
                        moved.Enqueue(around);
                    }
                }
            }
        }
    }

    // Whether a ramp may flag the corner at `index`, as World Editor's does: a corner on a cliff's top edge (a corner
    // around it a level lower), or one of the two corners below such an edge (a level higher within two corners).
    private static bool RampFits(MapEnvironment terrain, int index)
    {
        var columns = (int)terrain.Width + 1;
        var level = terrain.TerrainTiles[index].CliffLevel;
        var (column, row) = (index % columns, index / columns);
        for (var j = Math.Max(row - 2, 0); j <= Math.Min(row + 2, (int)terrain.Height); j++)
        {
            for (var i = Math.Max(column - 2, 0); i <= Math.Min(column + 2, (int)terrain.Width); i++)
            {
                var other = terrain.TerrainTiles[(j * columns) + i].CliffLevel;
                var near = Math.Abs(i - column) <= 1 && Math.Abs(j - row) <= 1;
                if (other == level + 1 || (near && other == level - 1))
                {
                    return true;
                }
            }
        }

        return false;
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
