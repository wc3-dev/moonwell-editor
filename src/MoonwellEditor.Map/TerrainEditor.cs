using System.Text;
using MoonwellEditor.Assets;
using MoonwellEditor.Files;
using MoonwellEditor.Model;
using War3Net.Build.Environment;
using War3Net.Build.Extensions;
using War3Net.Common.Extensions;

namespace MoonwellEditor.Map;

/// <summary>
/// The part of the terrain a stroke changed, for the page to redraw: corners <paramref name="Left"/> to
/// <paramref name="Left"/> + <paramref name="Columns"/> − 1 and <paramref name="Bottom"/> to <paramref name="Bottom"/>
/// + <paramref name="Rows"/> − 1, as <see cref="TerrainBytes.Patch"/> writes them; no corners when nothing changed.
/// </summary>
/// <param name="Left">The first corner's column.</param>
/// <param name="Bottom">The first corner's row.</param>
/// <param name="Columns">How many columns of corners.</param>
/// <param name="Rows">How many rows of corners.</param>
/// <param name="Bytes">The corners' and their tiles' bytes.</param>
/// <param name="Tiles">True when the map's list of tiles grew, so the page reads the whole scene again.</param>
/// <param name="Cliffs">True when cliff levels, ramps or water changed, so the cliff models change too.</param>
public sealed record TerrainPatch(int Left, int Bottom, int Columns, int Rows, byte[] Bytes, bool Tiles, bool Cliffs);

/// <summary>A cliff type the map lists, which the cliff tools offer.</summary>
/// <param name="Number">Its number in the map's list, what a corner's cliff type holds.</param>
/// <param name="Id">Its id in <c>TerrainArt\CliffTypes.slk</c>, <c>CLdi</c>.</param>
/// <param name="Name">Its name, from World Editor's strings.</param>
/// <param name="Texture">Its texture's game path, for a picture of it.</param>
public sealed record CliffKind(int Number, string Id, string Name, string Texture);

/// <summary>A tile the paint brush offers: the tileset's, then any other the map lists.</summary>
/// <param name="Id">Its id in <c>TerrainArt\Terrain.slk</c>, <c>Idrt</c>.</param>
/// <param name="Name">Its name, <c>Dirt</c>.</param>
/// <param name="Texture">Its texture's game path in the graphics mode asked, for a picture of it.</param>
/// <param name="InMap">Whether the map lists it already.</param>
public sealed record GroundTile(string Id, string Name, string Texture, bool InMap);

/// <summary>
/// The map's terrain as the Terrain Editor edits it: the ground, cliff and water brushes change its corners, each stroke
/// (mouse down to up) is one undo step with the object editor's, and a save writes <c>war3map.w3e</c> and
/// <c>war3map.wpm</c>. Only the pathing cells under the tiles a stroke changed are worked out again
/// (<see cref="Pathing"/>); the rest keep the bytes World Editor wrote (Sven, 2026-11-07), so an unedited map's pathing
/// stays as it was. Doodads keep their height.
/// </summary>
public sealed class TerrainEditor : IMapPart
{
    /// <summary>The most tiles a map lists, World Editor's limit (*claim*).</summary>
    public const int MostTiles = 16;

    private const string TerrainFile = "war3map.w3e";
    private const string PathingFile = "war3map.wpm";

    private readonly Session _session;
    private readonly IMapGameFiles _files;
    private readonly MapEnvironment _terrain;
    private readonly MapPathingMap? _pathingFile;
    private readonly byte[] _cells;
    private readonly Dictionary<string, Dictionary<string, Dictionary<string, int>>> _cliffModels = new(StringComparer.Ordinal);
    private CliffTiles _cliffs;
    private readonly War3Net.Build.Info.MapInfo? _info;
    private readonly float _waterLevel;
    private readonly IReadOnlyList<PathingStamp> _stamps;
    private readonly Dictionary<string, TerrainTextures> _textures = new(StringComparer.Ordinal);
    private Pathing _pathing;
    private OpenStroke? _stroke;

    private TerrainEditor(
        Session session,
        IMapGameFiles files,
        MapEnvironment terrain,
        MapPathingMap? pathing,
        War3Net.Build.Info.MapInfo? info,
        IReadOnlyList<PathingStamp> stamps)
    {
        _session = session;
        _files = files;
        _terrain = terrain;
        _pathingFile = pathing;
        _cells = pathing?.Cells.Select(cell => (byte)cell).ToArray() ?? [];
        _info = info;
        _stamps = stamps;
        _cliffs = Cliffs.Of(terrain, files, "sd", Models("sd")).Tiles;
        _waterLevel = MapScene.WaterLevel(terrain, files);
        _pathing = MakePathing();
    }

    /// <summary>Goes up with every change to the terrain: a stroke, and an undo or redo of one.</summary>
    public int Version { get; private set; }

    /// <summary>The terrain as edited.</summary>
    public MapEnvironment Terrain => _terrain;

    /// <summary>
    /// The terrain editor of <paramref name="session"/>'s map, attached to it; null when the map has no terrain file.
    /// </summary>
    /// <exception cref="InvalidDataException">The terrain file cannot be read.</exception>
    public static TerrainEditor? Open(Session session, IMapStore store, IMapGameFiles files)
    {
        var terrainBytes = session.Track(TerrainFile);
        if (terrainBytes == null)
        {
            return null;
        }

        var pathingBytes = session.Track(PathingFile);
        var terrain = Read(terrainBytes, reader => reader.ReadMapEnvironment());
        var pathing = pathingBytes == null ? null : Read(pathingBytes, reader => reader.ReadMapPathingMap());
        if (pathing != null && (pathing.Width != terrain.Width * 4 || pathing.Height != terrain.Height * 4))
        {
            pathing = null;   // not this terrain's: left as it is
        }

        var read = MapReader.Read(store);
        var editor = new TerrainEditor(session, files, terrain, pathing, read.Info, StampsOf(read, session, store, files));
        session.Attach(editor);
        return editor;
    }

    /// <summary>
    /// Uses <paramref name="tool"/> at each of <paramref name="points"/>, as one more step of the current stroke, or
    /// of a new one when <paramref name="first"/> is set (or none is open). <paramref name="tile"/> is the tile a paint
    /// gives, by its id; a tile the map does not list yet is added to its list. <paramref name="cliffType"/> is the
    /// cliff type a cliff tool gives, its number in the map's list.
    /// </summary>
    /// <exception cref="ArgumentException">The tile is not a known one, or the map lists <see cref="MostTiles"/> already.</exception>
    public TerrainPatch Stroke(
        GroundTool tool,
        IReadOnlyList<(float X, float Y)> points,
        Brush brush,
        string? tile,
        string mode,
        bool first,
        int cliffType = 0)
    {
        if (first || _stroke == null)
        {
            EndStroke();
            var begun = Corner(points.Count > 0 ? points[0] : (0, 0));
            var level = begun.IsWater ? (int)MathF.Round(begun.WaterHeight - begun.Height) + 2 : begun.CliffLevel;
            _stroke = new OpenStroke([.. _terrain.TerrainTypes], begun.Height, level);
        }

        var texture = -1;
        var listed = _terrain.TerrainTypes.Count;
        if (tool == GroundTool.Paint)
        {
            texture = TextureOf(tile ?? throw new ArgumentException("A paint needs a tile."));
        }

        var columns = (int)_terrain.Width + 1;
        var (left, bottom, right, top) = (int.MaxValue, int.MaxValue, -1, -1);
        var start = new StrokeStart(
            texture, _stroke.Plateau, _stroke.Level, Math.Clamp(cliffType, 0, Math.Max(_terrain.CliffTypes.Count - 1, 0)));
        foreach (var (x, y) in points)
        {
            GroundTools.Use(_terrain, tool, x, y, brush, start, index =>
            {
                _stroke.Corners.TryAdd(index, CornerState.Of(_terrain.TerrainTiles[index]));
                var (column, row) = (index % columns, index / columns);
                (left, bottom, right, top) = (Math.Min(left, column), Math.Min(bottom, row), Math.Max(right, column), Math.Max(top, row));
            });
        }

        var tiles = _terrain.TerrainTypes.Count != listed;
        var cliffs = GroundTools.ChangesCliffs(tool);
        if (right < 0)
        {
            return new TerrainPatch(0, 0, 0, 0, [], tiles, false);
        }

        // A cliff change reaches two tiles out: a ramp's side model is two tiles long.
        var reach = 1;
        if (cliffs)
        {
            CliffsChanged();
            reach = 2;
        }

        if (_pathingFile != null)
        {
            ForCells(left - reach, bottom - reach, right + reach - 1, top + reach - 1, index => _stroke.Cells.TryAdd(index, _cells[index]));
            _pathing.Rebuild(_cells, left - reach, bottom - reach, right + reach - 1, top + reach - 1);
        }

        Version++;
        return Patch(left - reach, bottom - reach, right + reach, top + reach, mode, tiles, cliffs);
    }

    /// <summary>Closes the open stroke, keeping it as one undo step; nothing when none is open or it changed nothing.</summary>
    public void EndStroke()
    {
        var stroke = _stroke;
        _stroke = null;
        if (stroke == null || (stroke.Corners.Count == 0 && stroke.Types.Count == _terrain.TerrainTypes.Count))
        {
            return;
        }

        var before = new State(stroke.Types, stroke.Corners, stroke.Cells);
        var after = new State(
            [.. _terrain.TerrainTypes],
            stroke.Corners.Keys.ToDictionary(index => index, index => CornerState.Of(_terrain.TerrainTiles[index])),
            stroke.Cells.Keys.ToDictionary(index => index, index => _cells[index]));
        _session.Record(() => Restore(before), () => Restore(after));
    }

    /// <summary>The tiles the paint brush offers in a graphics mode: the tileset's, then the map's others.</summary>
    public IReadOnlyList<GroundTile> Tiles(string mode)
    {
        var rows = (_files.Table("TerrainArt/Terrain.slk") ?? []).ToDictionary(row => row.Id, StringComparer.Ordinal);
        var listed = _terrain.TerrainTypes.Select(type => FourCC.Text((int)type)).ToList();
        var ids = TilesetTiles(mode).Concat(listed).Distinct().Where(rows.ContainsKey);
        return ids.Select(id =>
        {
            var row = rows[id].Columns;
            var stem = row.GetValueOrDefault("dir", "") + "\\" + row.GetValueOrDefault("file", "");
            return new GroundTile(id, row.GetValueOrDefault("comment", id), TerrainTextures.HdOrClassic(_files, stem, mode), listed.Contains(id));
        }).ToList();
    }

    /// <summary>The map's cliff types, which the cliff tools offer, in a graphics mode.</summary>
    public IReadOnlyList<CliffKind> CliffTypes(string mode)
    {
        var rows = (_files.Table("TerrainArt/CliffTypes.slk") ?? []).ToDictionary(row => row.Id, StringComparer.OrdinalIgnoreCase);
        var strings = GameText.Strings(_files.File(@"UI\WorldEditStrings.txt", "sd"));
        var textures = Cliffs.Textures(_terrain, _files, mode);
        return _terrain.CliffTypes.Select((type, number) =>
        {
            var id = FourCC.Text((int)type);
            var key = rows.TryGetValue(id, out var row) ? row.Columns.GetValueOrDefault("name", id) : id;
            return new CliffKind(number, id, strings.GetValueOrDefault(key, id), textures[number]);
        }).ToList();
    }

    /// <summary>The cliff and ramp models as the terrain has them now, in a graphics mode.</summary>
    public IReadOnlyList<CliffPiece> CliffPieces(string mode) => Cliffs.Of(_terrain, _files, mode, Models(mode)).Pieces;

    /// <summary>The whole map's pathing cells as they stand.</summary>
    internal IReadOnlyList<byte> Cells => _cells;

    /// <summary>The whole map's pathing cells worked out from nothing, for a comparison with World Editor's.</summary>
    internal byte[] RebuildAll() => _pathing.All();

    /// <inheritdoc />
    public IEnumerable<(string Name, byte[] Bytes)> Files()
    {
        yield return (TerrainFile, Write(writer => writer.Write(_terrain)));
        if (_pathingFile != null)
        {
            for (var index = 0; index < _cells.Length; index++)
            {
                _pathingFile.Cells[index] = (PathingType)_cells[index];
            }

            yield return (PathingFile, Write(writer => writer.Write(_pathingFile)));
        }
    }

    // The bytes the page redraws for corners left..right, bottom..top (clamped) and the tiles between them.
    private TerrainPatch Patch(int left, int bottom, int right, int top, string mode, bool tiles, bool cliffs)
    {
        (left, bottom) = (Math.Max(left, 0), Math.Max(bottom, 0));
        (right, top) = (Math.Min(right, (int)_terrain.Width), Math.Min(top, (int)_terrain.Height));
        if (!_textures.TryGetValue(mode, out var textures))
        {
            textures = _textures[mode] = TerrainTextures.Read(_terrain, _files, mode);
        }

        var grid = TerrainGrid.From(_terrain, _waterLevel);
        var layers = TileLayers.From(_terrain, textures, _cliffs);
        var bytes = TerrainBytes.Patch(grid, layers, _cliffs, left, bottom, right, top);
        return new TerrainPatch(left, bottom, right - left + 1, top - bottom + 1, bytes, tiles, cliffs);
    }

    // The number of tile `id` in the map's list, added at its end when the map does not list it yet.
    private int TextureOf(string id)
    {
        var at = _terrain.TerrainTypes.FindIndex(type => FourCC.Text((int)type) == id);
        if (at >= 0)
        {
            return at;
        }

        if (!(_files.Table("TerrainArt/Terrain.slk") ?? []).Any(row => row.Id == id))
        {
            throw new ArgumentException(Texts.Get("app.terrain.noTile", ("tile", id)));
        }

        if (_terrain.TerrainTypes.Count >= MostTiles)
        {
            throw new ArgumentException(Texts.Get("app.terrain.tooManyTiles", ("most", MostTiles.ToString())));
        }

        _terrain.TerrainTypes.Add((TerrainType)id.FromRawcode());
        TilesChanged();
        return _terrain.TerrainTypes.Count - 1;
    }

    private void Restore(State state)
    {
        if (!state.Types.SequenceEqual(_terrain.TerrainTypes))
        {
            _terrain.TerrainTypes.Clear();
            _terrain.TerrainTypes.AddRange(state.Types);
            TilesChanged();
        }

        foreach (var (index, corner) in state.Corners)
        {
            corner.Put(_terrain.TerrainTiles[index]);
        }

        foreach (var (index, cell) in state.Cells)
        {
            _cells[index] = cell;
        }

        CliffsChanged();
        Version++;
    }

    private void TilesChanged()
    {
        _textures.Clear();
        _pathing = MakePathing();
    }

    private void CliffsChanged()
    {
        _cliffs = Cliffs.Of(_terrain, _files, "sd", Models("sd")).Tiles;
        _pathing = MakePathing();
    }

    // The cliff models each folder has in a graphics mode, read once.
    private Dictionary<string, Dictionary<string, int>> Models(string mode)
    {
        if (!_cliffModels.TryGetValue(mode, out var known))
        {
            known = _cliffModels[mode] = new Dictionary<string, Dictionary<string, int>>(StringComparer.OrdinalIgnoreCase);
        }

        return known;
    }

    private Pathing MakePathing()
    {
        var rows = (_files.Table("TerrainArt/Terrain.slk") ?? []).ToDictionary(row => row.Id, StringComparer.Ordinal);
        var unbuildable = _terrain.TerrainTypes
            .Select(type => rows.TryGetValue(FourCC.Text((int)type), out var row) && row.Columns.GetValueOrDefault("buildable") == "0")
            .ToList();
        return new Pathing(_terrain, _info, _cliffs, _waterLevel, unbuildable, _stamps);
    }

    // The ids of the tileset's tiles, from World Editor's list of tilesets (its values after the name and the blight).
    private IEnumerable<string> TilesetTiles(string mode)
    {
        var bytes = _files.File("UI/WorldEditData.txt", mode);
        var entry = bytes == null
            ? null
            : GameText.Entry(Encoding.UTF8.GetString(bytes), "TileSets", ((char)_terrain.Tileset).ToString());
        return (entry?.Split(',') ?? []).Skip(2).Select(id => id.Trim()).Where(id => id.Length == 4);
    }

    private TerrainTile Corner((float X, float Y) point)
    {
        var column = Math.Clamp((int)MathF.Round((point.X - _terrain.Left) / 128f), 0, (int)_terrain.Width);
        var row = Math.Clamp((int)MathF.Round((point.Y - _terrain.Bottom) / 128f), 0, (int)_terrain.Height);
        return _terrain.TerrainTiles[(row * ((int)_terrain.Width + 1)) + column];
    }

    // Each pathing cell of tiles left..right, bottom..top, clamped to the map.
    private void ForCells(int left, int bottom, int right, int top, Action<int> each)
    {
        var width = (int)_terrain.Width * 4;
        for (var y = Math.Max(bottom, 0) * 4; y <= (Math.Min(top, (int)_terrain.Height - 1) * 4) + 3; y++)
        {
            for (var x = Math.Max(left, 0) * 4; x <= (Math.Min(right, (int)_terrain.Width - 1) * 4) + 3; x++)
            {
                each((y * width) + x);
            }
        }
    }

    // The pathing pictures of the map's doodads and walkable destructables (bridges); other destructables are the
    // game's at run time. A picture is the map's own import when it has one, else the game's.
    private static List<PathingStamp> StampsOf(MapFiles read, Session session, IMapStore store, IMapGameFiles files)
    {
        var pictures = new Dictionary<string, Rgba?>(StringComparer.OrdinalIgnoreCase);
        var stamps = new List<PathingStamp>();
        foreach (var doodad in read.Doodads?.Doodads ?? [])
        {
            var id = doodad.TypeId.ToRawcode();
            var destructable = session.Object(ObjectKind.Destructable, id);
            var bridge = destructable != null && Placed.Text(destructable, "bwal", "sd", 0) == "1";
            var view = destructable ?? session.Object(ObjectKind.Doodad, id);
            if (view == null || (destructable != null && !bridge))
            {
                continue;
            }

            var path = Placed.Text(view, destructable != null ? "bptx" : "dptx", "sd", 0);
            if (string.IsNullOrEmpty(path) || path == "_")
            {
                continue;
            }

            if (!pictures.TryGetValue(path, out var picture))
            {
                var bytes = store.ReadImport(path) ?? files.File(path, "sd");
                picture = pictures[path] = bytes == null ? null : Textures.Decode(bytes);
            }

            if (picture != null)
            {
                stamps.Add(new PathingStamp(doodad.Position.X, doodad.Position.Y, doodad.Rotation, picture, bridge));
            }
        }

        return stamps;
    }

    private static T Read<T>(byte[] bytes, Func<BinaryReader, T> read)
    {
        try
        {
            using var reader = new BinaryReader(new MemoryStream(bytes));
            return read(reader);
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            throw new InvalidDataException(exception.Message, exception);
        }
    }

    private static byte[] Write(Action<BinaryWriter> write)
    {
        using var stream = new MemoryStream();
        using (var writer = new BinaryWriter(stream, Encoding.UTF8, true))
        {
            write(writer);
        }

        return stream.ToArray();
    }

    // A stroke still open: the tiles the map listed, the plateau's height and the cliff level when it began, and each
    // corner's and pathing cell's value before the stroke first changed it.
    private sealed class OpenStroke(List<TerrainType> types, float plateau, int level)
    {
        public List<TerrainType> Types { get; } = types;

        public float Plateau { get; } = plateau;

        public int Level { get; } = level;

        public Dictionary<int, CornerState> Corners { get; } = [];

        public Dictionary<int, byte> Cells { get; } = [];
    }

    // The tiles listed, and the corners' and cells' values, on one side of a stroke.
    private sealed record State(
        List<TerrainType> Types,
        IReadOnlyDictionary<int, CornerState> Corners,
        IReadOnlyDictionary<int, byte> Cells);

    // A corner's values the brushes change, to put back on an undo or redo.
    private readonly record struct CornerState(
        float Height, int Texture, int CliffLevel, int CliffTexture, bool Ramp, bool Water, float WaterHeight)
    {
        public static CornerState Of(TerrainTile corner) => new(
            corner.Height, corner.Texture, corner.CliffLevel, corner.CliffTexture, corner.IsRamp, corner.IsWater, corner.WaterHeight);

        public void Put(TerrainTile corner)
        {
            corner.Height = Height;
            corner.Texture = Texture;
            corner.CliffLevel = CliffLevel;
            corner.CliffTexture = CliffTexture;
            corner.IsRamp = Ramp;
            corner.IsWater = Water;
            corner.WaterHeight = WaterHeight;
        }
    }
}
