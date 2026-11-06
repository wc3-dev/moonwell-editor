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

    private static War3Net.Build.Environment.TerrainTile Corner(TerrainEditor editor, int column, int row) =>
        editor.Terrain.TerrainTiles[(row * ((int)editor.Terrain.Width + 1)) + column];
}
