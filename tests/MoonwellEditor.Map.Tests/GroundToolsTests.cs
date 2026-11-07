namespace MoonwellEditor.Map.Tests;

public sealed class GroundToolsTests
{
    [Theory]
    [InlineData(BrushShape.Square, 1, 1)]
    [InlineData(BrushShape.Square, 2, 4)]
    [InlineData(BrushShape.Square, 3, 9)]
    [InlineData(BrushShape.Circle, 3, 9)]
    [InlineData(BrushShape.Circle, 4, 12)]
    [InlineData(BrushShape.Square, 4, 16)]
    public void A_brush_covers_its_size_in_corners(BrushShape shape, int size, int corners)
    {
        var terrain = Grids.Flat(11, 11);

        var covered = GroundTools.Covered(terrain, 5 * 128f, 5 * 128f, new Brush(shape, size, 0)).ToList();

        Assert.Equal(corners, covered.Count);
        Assert.Equal(1f, covered.Max(c => c.Weight));
    }

    [Fact]
    public void A_brush_at_the_edge_covers_only_corners_on_the_map()
    {
        var terrain = Grids.Flat(4, 4);

        Assert.Equal(4, GroundTools.Covered(terrain, 0, 0, new Brush(BrushShape.Square, 3, 0)).Count());
    }

    [Fact]
    public void Raise_lifts_the_middle_most_and_lower_takes_it_back()
    {
        var terrain = Grids.Flat(7, 7);
        var brush = new Brush(BrushShape.Circle, 3, 64);
        var changed = new List<int>();

        GroundTools.Use(terrain, GroundTool.Raise, 3 * 128f, 3 * 128f, brush, -1, 0, changed.Add);

        Assert.Equal(0.5f, terrain.At(3, 3).Height);
        Assert.InRange(terrain.At(4, 3).Height, 0.01f, 0.49f);
        Assert.Equal(9, changed.Count);
        GroundTools.Use(terrain, GroundTool.Lower, 3 * 128f, 3 * 128f, brush, -1, 0, _ => { });
        Assert.Equal(0f, terrain.At(3, 3).Height, 3);
    }

    [Fact]
    public void Plateau_brings_the_corners_to_its_height_and_smooth_evens_a_bump()
    {
        var terrain = Grids.Flat(7, 7);
        var brush = new Brush(BrushShape.Square, 1, 0);

        GroundTools.Use(terrain, GroundTool.Plateau, 3 * 128f, 3 * 128f, brush, -1, 2f, _ => { });
        Assert.Equal(2f, terrain.At(3, 3).Height);

        GroundTools.Use(terrain, GroundTool.Smooth, 3 * 128f, 3 * 128f, brush, -1, 0, _ => { });
        Assert.InRange(terrain.At(3, 3).Height, 0.1f, 1.9f);
    }

    [Fact]
    public void Paint_gives_the_tile_and_passes_only_corners_that_change()
    {
        var terrain = Grids.Flat(5, 5);
        terrain.At(2, 2).Texture = 1;
        var changed = new List<int>();

        GroundTools.Use(terrain, GroundTool.Paint, 2 * 128f, 2 * 128f, new Brush(BrushShape.Square, 3, 0), 1, 0, changed.Add);

        Assert.Equal(8, changed.Count);
        Assert.Equal(1, terrain.At(1, 1).Texture);
        Assert.Equal(0, terrain.At(0, 0).Texture);
    }
}
