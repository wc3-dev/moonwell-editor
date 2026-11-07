using System.Globalization;
using System.Numerics;
using System.Text.Json.Serialization;
using MoonwellEditor.Files;
using MoonwellEditor.Model;
using War3Net.Build.Widget;
using War3Net.Common.Extensions;

namespace MoonwellEditor.Map;

/// <summary>A player a placed unit can belong to: one of the map's, or a neutral one.</summary>
/// <param name="Number">The player's number in the unit file: 0 for player 1, 24 Neutral Hostile, 27 Neutral Passive.</param>
/// <param name="Name">The player's name: the map's, or the neutral player's.</param>
public sealed record PlacePlayer(int Number, string Name);

/// <summary>What kind of thing can be placed; it goes to and from the page by its name.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<PlaceKind>))]
public enum PlaceKind
{
    /// <summary>A unit, in <c>war3mapUnits.doo</c>.</summary>
    Unit,

    /// <summary>An item, in <c>war3mapUnits.doo</c>.</summary>
    Item,

    /// <summary>A destructable, in <c>war3map.doo</c>.</summary>
    Destructable,

    /// <summary>A doodad, in <c>war3map.doo</c>.</summary>
    Doodad,
}

/// <summary>
/// The placed things: the doodad file's doodads and destructables, then the unit file's units, items and start locations,
/// numbered from 1 in that order (as <see cref="Placed.Things"/> numbers them). Each change is one undo step, and the
/// pathing cells under a doodad's or a bridge's picture, where it was and where it is, are worked out again with it.
/// A new thing takes World Editor's values (read from Blizzard's maps): facing 270°, scale 1, the next creation number
/// in its file, the ground's height; a unit 12500 gold and hero level 1, an item Neutral Passive.
/// </summary>
public sealed partial class TerrainEditor
{
    private const string DoodadsFile = "war3map.doo";
    private const string UnitsFile = "war3mapUnits.doo";
    private const int NeutralHostile = 24;
    private const int NeutralPassive = 27;
    private const float Facing = 3f * MathF.PI / 2f;

    /// <summary>The doodads and destructables as edited; null when the map has no doodad file.</summary>
    public MapDoodads? Doodads => _doodads;

    /// <summary>The units, items and start locations as edited; null when the map has no unit file.</summary>
    public MapUnits? Units => _units;

    /// <summary>The placed things as the view draws them, in a graphics mode.</summary>
    public IReadOnlyList<PlacedThing> Things(string mode)
    {
        var files = new MapFiles(_terrain, _doodads, _units, null, null, _info, null, []);
        return Placed.Things(files, TerrainGrid.From(_terrain, _waterLevel), _session, mode);
    }

    /// <summary>The players a placed unit can belong to: the map's, then Neutral Hostile and Neutral Passive.</summary>
    public IReadOnlyList<PlacePlayer> Players()
    {
        var players = (_info?.Players ?? []).OrderBy(player => player.Id)
            .Select(player => new PlacePlayer(player.Id, string.IsNullOrWhiteSpace(player.Name)
                ? Texts.Get("app.terrain.player", ("number", (player.Id + 1).ToString(CultureInfo.InvariantCulture)))
                : _session.Text(player.Name)))
            .ToList();
        players.Add(new PlacePlayer(NeutralHostile, Texts.Get("app.folder.hostile")));
        players.Add(new PlacePlayer(NeutralPassive, Texts.Get("app.folder.passive")));
        return players;
    }

    /// <summary>
    /// Places a <paramref name="kind"/> of type <paramref name="typeId"/> at <paramref name="x"/>, <paramref name="y"/>;
    /// a unit belongs to <paramref name="owner"/>. Gives the new thing's number.
    /// </summary>
    /// <exception cref="ArgumentException">The map has no file for the kind, or no such type.</exception>
    public int Place(PlaceKind kind, string typeId, float x, float y, int owner)
    {
        EndStroke();
        var objectKind = kind switch
        {
            PlaceKind.Unit => ObjectKind.Unit,
            PlaceKind.Item => ObjectKind.Item,
            PlaceKind.Destructable => ObjectKind.Destructable,
            _ => ObjectKind.Doodad,
        };
        var view = _session.Object(objectKind, typeId)
            ?? throw new ArgumentException(Texts.Get("app.terrain.noType", ("id", typeId)));
        var z = TerrainGrid.From(_terrain, _waterLevel).GroundAt(x, y);
        if (kind is PlaceKind.Destructable or PlaceKind.Doodad)
        {
            var doodads = _doodads ?? throw new ArgumentException(Texts.Get("app.terrain.noFile", ("name", DoodadsFile)));
            var prefix = kind == PlaceKind.Destructable ? "b" : "d";
            var variations = int.TryParse(Placed.Text(view, prefix + "var", "sd", 0), out var count) ? count : 1;
            var doodad = new DoodadData
            {
                TypeId = typeId.FromRawcode(),
                SkinId = typeId.FromRawcode(),
                Variation = Random.Shared.Next(Math.Max(variations, 1)),
                Position = new Vector3(x, y, z),
                Rotation = Facing,
                Scale = Vector3.One,
                State = DoodadState.Normal,
                Life = 100,
                CreationNumber = doodads.Doodads.Count == 0 ? 0 : doodads.Doodads.Max(each => each.CreationNumber) + 1,
            };
            var at = doodads.Doodads.Count;
            Change(() => doodads.Doodads.Insert(at, doodad), () => doodads.Doodads.RemoveAt(at), Footprints(doodad));
            return at + 1;
        }

        var units = _units ?? throw new ArgumentException(Texts.Get("app.terrain.noFile", ("name", UnitsFile)));
        var item = kind == PlaceKind.Item;
        var unit = new UnitData
        {
            TypeId = typeId.FromRawcode(),
            SkinId = typeId.FromRawcode(),
            Position = new Vector3(x, y, z),
            Rotation = Facing,
            Scale = Vector3.One,
            Flags = 2,
            OwnerId = item ? NeutralPassive : owner,
            GoldAmount = item ? 0 : 12500,
            TargetAcquisition = item ? 0 : -1,
            HeroLevel = item ? 0 : 1,
            RandomData = new RandomUnitAny { Level = 1, Class = ItemClass.Permanent },
            CreationNumber = units.Units.Count == 0 ? 0 : units.Units.Max(each => each.CreationNumber) + 1,
        };
        var index = units.Units.Count;
        Change(() => units.Units.Insert(index, unit), () => units.Units.RemoveAt(index), []);
        return (_doodads?.Doodads.Count ?? 0) + index + 1;
    }

    /// <summary>Moves thing <paramref name="number"/> to <paramref name="x"/>, <paramref name="y"/>, on the ground there.</summary>
    /// <exception cref="ArgumentException">There is no such thing.</exception>
    public void Move(int number, float x, float y)
    {
        EndStroke();
        var widget = WidgetOf(number);
        var before = widget.Position;
        var after = new Vector3(x, y, TerrainGrid.From(_terrain, _waterLevel).GroundAt(x, y));
        var areas = widget is DoodadData doodad ? Footprints(doodad).Concat(Footprints(doodad, after)).ToList() : [];
        Change(() => widget.Position = after, () => widget.Position = before, areas);
    }

    /// <summary>Turns thing <paramref name="number"/> by <paramref name="degrees"/>, counter-clockwise.</summary>
    /// <exception cref="ArgumentException">There is no such thing.</exception>
    public void Turn(int number, float degrees)
    {
        EndStroke();
        var widget = WidgetOf(number);
        var before = widget.Rotation;
        var turned = (before + (degrees * MathF.PI / 180f)) % (2f * MathF.PI);
        var after = turned < 0 ? turned + (2f * MathF.PI) : turned;
        Change(() => widget.Rotation = after, () => widget.Rotation = before, widget is DoodadData doodad ? Footprints(doodad) : []);
    }

    /// <summary>Gives doodad or destructable <paramref name="number"/> a scale; a unit or item is left as it is.</summary>
    /// <exception cref="ArgumentException">There is no such thing.</exception>
    public void Resize(int number, float scale)
    {
        EndStroke();
        if (WidgetOf(number) is not DoodadData doodad)
        {
            return;
        }

        var before = doodad.Scale;
        var after = new Vector3(Math.Clamp(scale, 0.1f, 10f));
        Change(() => doodad.Scale = after, () => doodad.Scale = before, []);
    }

    /// <summary>Gives unit <paramref name="number"/> to <paramref name="owner"/>; anything else is left as it is.</summary>
    /// <exception cref="ArgumentException">There is no such thing.</exception>
    public void Own(int number, int owner)
    {
        EndStroke();
        if (WidgetOf(number) is not UnitData unit || unit.HeroLevel == 0)
        {
            return;
        }

        var before = unit.OwnerId;
        Change(() => unit.OwnerId = owner, () => unit.OwnerId = before, []);
    }

    /// <summary>Removes thing <paramref name="number"/>.</summary>
    /// <exception cref="ArgumentException">There is no such thing.</exception>
    public void Remove(int number)
    {
        EndStroke();
        var widget = WidgetOf(number);
        if (widget is DoodadData doodad)
        {
            var doodads = _doodads!.Doodads;
            var at = doodads.IndexOf(doodad);
            Change(() => doodads.RemoveAt(at), () => doodads.Insert(at, doodad), Footprints(doodad));
            return;
        }

        var units = _units!.Units;
        var unit = (UnitData)widget;
        var index = units.IndexOf(unit);
        Change(() => units.RemoveAt(index), () => units.Insert(index, unit), []);
    }

    // The thing numbered `number`: a doodad file's entry, then a unit file's.
    private WidgetData WidgetOf(int number)
    {
        var doodads = _doodads?.Doodads.Count ?? 0;
        if (number >= 1 && number <= doodads)
        {
            return _doodads!.Doodads[number - 1];
        }

        var index = number - doodads - 1;
        return _units != null && index >= 0 && index < _units.Units.Count
            ? _units.Units[index]
            : throw new ArgumentException(Texts.Get("app.terrain.noThing", ("number", number.ToString(CultureInfo.InvariantCulture))));
    }

    // The tiles a doodad's pathing picture can cover at `at` (its place when null), whichever way it turns; none when it
    // has no picture.
    private List<(int Left, int Bottom, int Right, int Top)> Footprints(DoodadData doodad, Vector3? at = null)
    {
        if (PictureOf(doodad) is not var (picture, _))
        {
            return [];
        }

        var (x, y) = ((at ?? doodad.Position).X, (at ?? doodad.Position).Y);
        var reach = (int)MathF.Ceiling(Math.Max(picture.Width, picture.Height) / 8f) + 1;
        var column = (int)MathF.Floor((x - _terrain.Left) / 128f);
        var row = (int)MathF.Floor((y - _terrain.Bottom) / 128f);
        return [(column - reach, row - reach, column + reach, row + reach)];
    }

    // Makes a change to the things as one undo step: `apply` makes it and `revert` takes it back. The pathing cells of
    // `areas` (tiles) are worked out again after it, and kept as they were before it and after it for undo and redo.
    private void Change(Action apply, Action revert, IReadOnlyList<(int Left, int Bottom, int Right, int Top)> areas)
    {
        var cells = new Dictionary<int, byte>();
        if (_pathingFile != null)
        {
            foreach (var (left, bottom, right, top) in areas)
            {
                ForCells(left, bottom, right, top, index => cells.TryAdd(index, _cells[index]));
            }
        }

        apply();
        _stamps = StampsOf();
        _pathing = MakePathing();
        if (_pathingFile != null)
        {
            foreach (var (left, bottom, right, top) in areas)
            {
                _pathing.Rebuild(_cells, left, bottom, right, top);
            }
        }

        var before = cells;
        var after = cells.Keys.ToDictionary(index => index, index => _cells[index]);
        Version++;
        _session.Record(() => Put(revert, before), () => Put(apply, after));
    }

    // An undo or redo of a change to the things: the change, then the pathing cells as they were on that side of it.
    private void Put(Action change, IReadOnlyDictionary<int, byte> cells)
    {
        change();
        _stamps = StampsOf();
        _pathing = MakePathing();
        foreach (var (index, cell) in cells)
        {
            _cells[index] = cell;
        }

        Version++;
    }
}
