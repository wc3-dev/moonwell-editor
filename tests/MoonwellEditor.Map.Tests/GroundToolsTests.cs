namespace MoonwellEditor.Map.Tests;

public sealed class GroundToolsTests
{
    // World Editor's size n covers 2n - 1 corners across, around the corner nearest the mouse (its Lost Temple, 11-07:
    // a size 2 paint gave 3 by 3 corners, size 3 and 5 cliffs 5 by 5 and 9 by 9).
    [Theory]
    [InlineData(BrushShape.Square, 1, 1)]
    [InlineData(BrushShape.Square, 2, 9)]
    [InlineData(BrushShape.Square, 3, 25)]
    [InlineData(BrushShape.Square, 5, 81)]
    [InlineData(BrushShape.Circle, 3, 21)]
    public void A_brush_covers_World_Editors_corners(BrushShape shape, int size, int corners)
    {
        var terrain = Grids.Flat(21, 21);

        var covered = GroundTools.Covered(terrain, 10.4f * 128f, 9.7f * 128f, new Brush(shape, size, 0)).ToList();

        Assert.Equal(corners, covered.Count);
        var middle = covered.MaxBy(c => c.Weight);
        Assert.Equal((10, 10), (middle.Column, middle.Row));
    }

    [Fact]
    public void A_brush_at_the_edge_covers_only_corners_on_the_map()
    {
        var terrain = Grids.Flat(4, 4);

        Assert.Equal(9, GroundTools.Covered(terrain, 0, 0, new Brush(BrushShape.Square, 3, 0)).Count());
    }

    [Fact]
    public void Raise_lifts_the_middle_most_and_lower_takes_it_back()
    {
        var terrain = Grids.Flat(7, 7);
        var brush = new Brush(BrushShape.Circle, 2, 64);
        var changed = new List<int>();

        GroundTools.Use(terrain, GroundTool.Raise, 3 * 128f, 3 * 128f, brush, new StrokeStart(-1, 0, 2, 0), changed.Add);

        Assert.Equal(0.5f, terrain.At(3, 3).Height);
        Assert.InRange(terrain.At(4, 3).Height, 0.01f, 0.49f);
        Assert.Equal(9, changed.Count);
        GroundTools.Use(terrain, GroundTool.Lower, 3 * 128f, 3 * 128f, brush, new StrokeStart(-1, 0, 2, 0), _ => { });
        Assert.Equal(0f, terrain.At(3, 3).Height, 3);
    }

    [Fact]
    public void Plateau_brings_the_corners_to_its_height_and_smooth_evens_a_bump()
    {
        var terrain = Grids.Flat(7, 7);
        var brush = new Brush(BrushShape.Square, 1, 0);

        GroundTools.Use(terrain, GroundTool.Plateau, 3 * 128f, 3 * 128f, brush, new StrokeStart(-1, 2f, 2, 0), _ => { });
        Assert.Equal(2f, terrain.At(3, 3).Height);

        GroundTools.Use(terrain, GroundTool.Smooth, 3 * 128f, 3 * 128f, brush, new StrokeStart(-1, 0, 2, 0), _ => { });
        Assert.InRange(terrain.At(3, 3).Height, 0.1f, 1.9f);
    }

    [Fact]
    public void Paint_gives_the_tile_and_passes_only_corners_that_change()
    {
        var terrain = Grids.Flat(5, 5);
        terrain.At(2, 2).Texture = 1;
        var changed = new List<int>();

        var brush = new Brush(BrushShape.Square, 2, 0);
        GroundTools.Use(terrain, GroundTool.Paint, 2 * 128f, 2 * 128f, brush, new StrokeStart(1, 0, 2, 0), changed.Add);

        Assert.Equal(8, changed.Count);
        Assert.Equal(1, terrain.At(1, 1).Texture);
        Assert.Equal(0, terrain.At(0, 0).Texture);
    }

    [Fact]
    public void Cliff_up_lifts_the_brush_a_level_and_the_corners_around_follow_within_two()
    {
        var terrain = Grids.Flat(9, 9);
        var start = new StrokeStart(-1, 0, 2, 0);
        var brush = new Brush(BrushShape.Square, 1, 0);

        GroundTools.Use(terrain, GroundTool.CliffUp, 4 * 128f, 4 * 128f, brush, start, _ => { });
        Assert.Equal(3, terrain.At(4, 4).CliffLevel);
        Assert.Equal(2, terrain.At(5, 4).CliffLevel);

        // From level 6 the middle goes to 7; the ring around it comes up to 5, the next ring to 3.
        GroundTools.Use(terrain, GroundTool.CliffUp, 4 * 128f, 4 * 128f, brush, start with { Level = 6 }, _ => { });
        Assert.Equal(7, terrain.At(4, 4).CliffLevel);
        Assert.Equal(5, terrain.At(5, 5).CliffLevel);
        Assert.Equal(3, terrain.At(6, 4).CliffLevel);
        Assert.Equal(2, terrain.At(7, 4).CliffLevel);
    }

    [Fact]
    public void Water_lowers_the_corners_below_the_land_and_floods_them_as_deep_as_World_Editors()
    {
        // Land on a hill half a level up, where the stroke begins.
        var terrain = Grids.Flat(5, 5);
        terrain.At(2, 2).Height = 0.5f;
        var start = new StrokeStart(-1, 0.5f, 2, 0);

        GroundTools.Use(terrain, GroundTool.DeepWater, 2 * 128f, 2 * 128f, new Brush(BrushShape.Square, 1, 0), start, _ => { });

        var corner = terrain.At(2, 2);
        Assert.Equal((0, true, 0.5f, 0.5f), (corner.CliffLevel, corner.IsWater, corner.WaterHeight, corner.Height));
        var grid = TerrainGrid.From(terrain, -89.6f);
        Assert.Equal(166.4f, grid.Water(2, 2)!.Value - grid.Ground(2, 2), 2);
    }

    [Fact]
    public void Ramp_flags_only_World_Editors_three_corners_across_a_cliff_and_leaves_their_levels()
    {
        // A cliff a level up east of column 5, as World Editor's sample had; its size 3 ramp across the edge flagged the
        // top corner and the two below it, not the plateau behind or the ground further out.
        var terrain = Grids.Flat(11, 11);
        for (var row = 0; row <= 10; row++)
        {
            for (var column = 0; column <= 5; column++)
            {
                terrain.At(column, row).CliffLevel = 3;
            }
        }

        GroundTools.Use(
            terrain, GroundTool.Ramp, 6 * 128f, 5 * 128f, new Brush(BrushShape.Square, 3, 0), new StrokeStart(-1, 0, 2, 0), _ => { });

        var flagged = Enumerable.Range(4, 5).Where(column => terrain.At(column, 5).IsRamp).ToList();
        Assert.Equal([5, 6, 7], flagged);
        Assert.Equal((3, 2), (terrain.At(5, 5).CliffLevel, terrain.At(6, 5).CliffLevel));
    }

    [Fact]
    public void Ramp_on_flat_ground_flags_nothing()
    {
        var terrain = Grids.Flat(5, 5);
        var changed = new List<int>();

        GroundTools.Use(
            terrain, GroundTool.Ramp, 2 * 128f, 2 * 128f, new Brush(BrushShape.Square, 3, 0), new StrokeStart(-1, 0, 2, 0), changed.Add);

        Assert.Empty(changed);
    }

    [Fact]
    public void Ramp_across_a_slanted_cliff_flags_World_Editors_corners()
    {
        // World Editor's size 3 ramp across a cliff whose edge runs corner to corner (Sven's map, 11-07), from column 19,
        // row 39 at the top left: a level, then R where World Editor flagged a ramp. The ramp covers 5 by 5 tiles.
        string[] map =
        [
            "2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.",
            "2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.",
            "2.2.2.2.2.2.2.2.3.3.3.3.3.2.2.",
            "2.2.2.2.2.2.2.2.3.3.3.3.3.2.2.",
            "2.2.2.2.2.2.2.3.3.3.3.3.3.2.2.",
            "2.2.2.2.2.2.3.3.3.3.3.3.3.2.2.",
            "2.2.2.2.2.3.3.3.3.3.3.3.3.2.2.",
            "2.2.2.2.3.3.3.3.3.3.3.3.3.2.2.",
            "2.2.2.3.3.3.3.3.3.3.3.3.3.2.2.",
            "2.2.3.3.3.3.3.3.3.3.3R3R2R2.2.",
            "2.2.3.3.3.3.3.3.3.3R3R2R2R2.2.",
            "2.2.3.3.3.3.3.3.3R3R2R2R2R2.2.",
            "2.2.3.3.3.3.3.3R3R2R2R2R2.2.2.",
            "2.2.3.3.3.3.3.3R2R2R2R2.2.2.2.",
            "2.2.3.3.3.3.3.2R2R2R2.2.2.2.2.",
            "2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.",
            "2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.",
        ];
        var terrain = Grids.Flat(40, 40);
        for (var line = 0; line < map.Length; line++)
        {
            for (var cell = 0; cell < 15; cell++)
            {
                terrain.At(19 + cell, 39 - line).CliffLevel = map[line][cell * 2] - '0';
            }
        }

        GroundTools.Use(
            terrain, GroundTool.Ramp, 28.5f * 128f, 27.5f * 128f, new Brush(BrushShape.Square, 3, 0), new StrokeStart(-1, 0, 2, 0), _ => { });

        var flagged = string.Join(Environment.NewLine, map.Select((row, line) => string.Concat(
            Enumerable.Range(0, 15).Select(cell => $"{row[cell * 2]}{(terrain.At(19 + cell, 39 - line).IsRamp ? 'R' : '.')}"))));
        Assert.Equal(string.Join(Environment.NewLine, map), flagged);
    }
}
