using MoonwellEditor.Files;
using MoonwellEditor.Model;
using War3Net.Build.Extensions;

namespace MoonwellEditor.Map.Tests;

public sealed class TerrainEditorTests(ITestOutputHelper output)
{
    // A copy of the install's map, with a session and a terrain editor over it; null without an install.
    private (TempFolder Folder, IMapStore Store, Session Session, TerrainEditor Editor)? Open(string map)
    {
        var files = InstallGameFiles.Open();
        var install = InstallMaps.Open(map);
        if (files == null || install == null || TestGameData.Data == null)
        {
            output.WriteLine(InstallMaps.NoInstall);
            return null;
        }

        var folder = new TempFolder();
        var path = Path.Combine(folder.Path, Path.GetFileName(install.Path));
        File.Copy(install.Path, path);
        var store = MapStore.Open(path);
        var session = TestGameData.Open(store)!;
        return (folder, store, session, TerrainEditor.Open(session, store, files)!);
    }

    [Theory]
    [InlineData(InstallMaps.LostTemple, 99.5)]
    [InlineData(InstallMaps.Stromguarde, 99.5)]
    [InlineData(InstallMaps.WarChasers, 98.5)]
    public void Pathing_worked_out_from_the_map_matches_World_Editors(string map, double least)
    {
        if (Open(map) is not var (folder, _, _, editor))
        {
            return;
        }

        using (folder)
        {
            var rebuilt = editor.RebuildAll();
            var same = rebuilt.Where((cell, index) => cell == editor.Cells[index]).Count();
            var percent = 100.0 * same / rebuilt.Length;
            output.WriteLine($"{map}: {percent:F2}% of {rebuilt.Length} cells as World Editor wrote them");
            Assert.True(percent >= least, $"{percent:F2}% is under {least}%");
        }
    }

    [Fact]
    public void A_stroke_is_one_undo_step_and_an_unedited_map_is_not_dirty()
    {
        if (Open(InstallMaps.LostTemple) is not var (folder, _, session, editor))
        {
            return;
        }

        using (folder)
        {
            Assert.False(session.Dirty);
            var corner = Corner(editor, 80, 80);
            var height = corner.Height;
            var cells = editor.Cells.ToArray();
            var brush = new Brush(BrushShape.Circle, 3, 64);
            var (x, y) = (editor.Terrain.Left + (80 * 128f), editor.Terrain.Bottom + (80 * 128f));

            var patch = editor.Stroke(GroundTool.Raise, [(x, y)], brush, null, "sd", first: true);
            editor.Stroke(GroundTool.Raise, [(x, y)], brush, null, "sd", first: false);
            editor.EndStroke();

            Assert.Equal(height + 1f, corner.Height, 3);
            Assert.True(patch.Columns > 0 && patch.Bytes.Length > 0);
            Assert.False(patch.Tiles);
            Assert.True(session.Dirty);
            Assert.True(session.Undo());
            Assert.Equal(height, corner.Height);
            Assert.Equal(cells, editor.Cells);
            Assert.False(session.Dirty);
            Assert.True(session.Redo());
            Assert.Equal(height + 1f, corner.Height, 3);
        }
    }

    [Fact]
    public void Painting_a_tile_the_map_lacks_adds_it_and_a_save_writes_the_terrain()
    {
        if (Open(InstallMaps.LostTemple) is not var (folder, store, session, editor))
        {
            return;
        }

        using (folder)
        {
            var listed = editor.Terrain.TerrainTypes.Count;
            Assert.All(editor.Tiles("sd"), tile => Assert.True(tile.InMap)); // Lost Temple lists all of Icecrown's tiles
            var other = new GroundTile("Ldrt", "Dirt", "", false);
            var (x, y) = (editor.Terrain.Left + (70 * 128f), editor.Terrain.Bottom + (70 * 128f));

            var patch = editor.Stroke(GroundTool.Paint, [(x, y)], new Brush(BrushShape.Square, 2, 0), other.Id, "sd", first: true);
            editor.EndStroke();

            Assert.True(patch.Tiles);
            Assert.Equal(listed + 1, editor.Terrain.TerrainTypes.Count);
            Assert.Equal(listed, Corner(editor, 70, 70).Texture);
            var report = session.Save();
            Assert.Contains("war3map.w3e", report.Written);
            using var reader = new BinaryReader(new MemoryStream(MapStore.Open(store.Path).Read("war3map.w3e")!));
            var saved = reader.ReadMapEnvironment();
            Assert.Equal(listed + 1, saved.TerrainTypes.Count);
            Assert.Equal(listed, saved.TerrainTiles[(70 * ((int)saved.Width + 1)) + 70].Texture);

            Assert.True(session.Undo());
            Assert.Equal(listed, editor.Terrain.TerrainTypes.Count);
        }
    }

    [Fact]
    public void Raising_ground_out_of_the_water_makes_its_cells_dry_and_a_save_writes_the_pathing()
    {
        if (Open(InstallMaps.LostTemple) is not var (folder, _, session, editor))
        {
            return;
        }

        using (folder)
        {
            // A corner of shallow water with water all round it, away from cliffs and the boundary.
            var terrain = editor.Terrain;
            var columns = (int)terrain.Width + 1;
            var at = Enumerable.Range(0, terrain.TerrainTiles.Count).First(index =>
            {
                var (column, row) = (index % columns, index / columns);
                return column > 20 && row > 20 && column < terrain.Width - 20 && row < terrain.Height - 20
                    && Enumerable.Range(-2, 5).All(dy => Enumerable.Range(-2, 5).All(dx =>
                    {
                        var corner = terrain.TerrainTiles[index + (dy * columns) + dx];
                        return corner.IsWater && corner.CliffLevel == 1 && !corner.IsRamp;
                    }));
            });
            var (x, y) = (terrain.Left + (at % columns * 128f), terrain.Bottom + (at / columns * 128f));
            var cell = (((at / columns) * 4) * ((int)terrain.Width * 4)) + ((at % columns) * 4);
            Assert.Equal(0x08, editor.Cells[cell]);

            editor.Stroke(GroundTool.Raise, [(x, y), (x, y), (x, y)], new Brush(BrushShape.Square, 1, 128), null, "sd", first: true);
            editor.EndStroke();

            Assert.Equal(0x40, editor.Cells[cell] & 0x40); // dry now
            var report = session.Save();
            Assert.Contains("war3map.wpm", report.Written);
            Assert.Contains("war3map.w3e", report.Written);
        }
    }

    [Fact]
    public void A_cliff_up_makes_cliff_models_and_cliff_pathing_and_undo_takes_them_back()
    {
        if (Open(InstallMaps.LostTemple) is not var (folder, _, session, editor))
        {
            return;
        }

        using (folder)
        {
            // Flat land at level 2, no water or ramps for three corners round, away from the edges.
            var terrain = editor.Terrain;
            var columns = (int)terrain.Width + 1;
            var at = Enumerable.Range(0, terrain.TerrainTiles.Count).First(index =>
            {
                var (column, row) = (index % columns, index / columns);
                return column > 30 && row > 30 && column < terrain.Width - 30 && row < terrain.Height - 30
                    && Enumerable.Range(-3, 7).All(dy => Enumerable.Range(-3, 7).All(dx =>
                    {
                        var corner = terrain.TerrainTiles[index + (dy * columns) + dx];
                        return corner.CliffLevel == 2 && !corner.IsWater && !corner.IsRamp;
                    }));
            });
            var (column, row) = (at % columns, at / columns);
            var (x, y) = (terrain.Left + (column * 128f), terrain.Bottom + (row * 128f));
            var piecesBefore = editor.CliffPieces("sd").Count;
            var cells = editor.Cells.ToArray();
            var types = editor.CliffTypes("sd");
            Assert.NotEmpty(types);
            Assert.All(types, type => Assert.DoesNotContain("WESTRING", type.Name, StringComparison.Ordinal));

            var patch = editor.Stroke(GroundTool.CliffUp, [(x, y)], new Brush(BrushShape.Square, 3, 0), null, "sd", first: true);
            editor.EndStroke();

            Assert.True(patch.Cliffs);
            Assert.Equal(3, Corner(editor, column, row).CliffLevel);
            Assert.True(editor.CliffPieces("sd").Count > piecesBefore);
            // The tile between the raised corners and the land below it is a cliff now.
            var cell = ((row - 2) * 4 * ((int)terrain.Width * 4)) + ((column - 2) * 4);
            Assert.Equal(0xCA, editor.Cells[cell]);

            Assert.True(session.Undo());
            Assert.Equal(2, Corner(editor, column, row).CliffLevel);
            Assert.Equal(piecesBefore, editor.CliffPieces("sd").Count);
            Assert.Equal(cells, editor.Cells);
            Assert.False(session.Dirty);
        }
    }

    private static War3Net.Build.Environment.TerrainTile Corner(TerrainEditor editor, int column, int row) =>
        editor.Terrain.TerrainTiles[(row * ((int)editor.Terrain.Width + 1)) + column];
}
