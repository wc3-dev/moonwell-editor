using System.Globalization;
using War3Net.Build;
using War3Net.Build.Common;
using War3Net.Build.Extensions;
using War3Net.Build.Info;
using War3Net.Build.Providers;
using War3Net.Build.Widget;
using War3Net.CodeAnalysis;
using War3Net.CodeAnalysis.Jass;
using War3Net.CodeAnalysis.Jass.Extensions;
using War3Net.Common.Extensions;

namespace MoonwellEditor.Triggers;

// The lines that make each placed unit and item, as World Editor writes them. They follow War3Net's MapScriptBuilder
// (MIT), with what World Editor does differently, checked against every map of the install: a unit's facing, an
// autocast ability's order and a unit's or item's team colour from the game's data, a waygate's region by its name,
// empty player functions written, and items with a variable.
public sealed partial class PlacedScript
{
    /// <inheritdoc />
    // World Editor writes this and CreatePlayerUnits even with nothing in them.
    protected override bool ShouldGenerateCreatePlayerBuildings(Map map) => true;

    /// <inheritdoc />
    protected override bool ShouldGenerateCreatePlayerUnits(Map map) => true;

    // A building by the game's data with the map's changes (War3Net's list is the game's of 1.31).
    private bool Building(UnitData unit) => unit.IsRandomBuilding() || _field(unit.TypeId.ToRawcode(), "ubdg") == "1";

    /// <inheritdoc />
    protected override bool ShouldGenerateCreateBuildingsForPlayerAndUnit(Map map, int playerId, UnitData unitData) =>
        unitData.OwnerId == playerId && unitData.IsUnit() && Building(unitData);

    /// <inheritdoc />
    protected override bool ShouldGenerateCreateUnitsForPlayerAndUnit(Map map, int playerId, UnitData unitData) =>
        unitData.OwnerId == playerId && unitData.IsUnit() && !unitData.IsPlayerStartLocation() && !Building(unitData);

    /// <inheritdoc />
    protected override bool ShouldGenerateCreatePlayerBuildingsForUnit(Map map, UnitData unitData) =>
        unitData.OwnerId < MaxPlayerSlots && unitData.IsUnit() && Building(unitData);

    /// <inheritdoc />
    protected override bool CreatePlayerUnitConditionSingleUnit(Map map, UnitData unitData) =>
        unitData.OwnerId < MaxPlayerSlots && unitData.IsUnit() && !unitData.IsPlayerStartLocation() && !Building(unitData);

    /// <inheritdoc />
    protected override bool ShouldGenerateCreateNeutralHostileBuildingsForUnit(Map map, UnitData unitData) =>
        unitData.OwnerId == MaxPlayerSlots && unitData.IsUnit() && Building(unitData);

    /// <inheritdoc />
    protected override bool ShouldGenerateCreateNeutralPassiveBuildingsForUnit(Map map, UnitData unitData) =>
        unitData.OwnerId == MaxPlayerSlots + 3 && unitData.IsUnit() && Building(unitData);

    /// <inheritdoc />
    protected override bool ShouldGenerateCreateNeutralPassiveForUnit(Map map, UnitData unitData) =>
        unitData.OwnerId == MaxPlayerSlots + 3 && unitData.IsUnit()
        && ((map.Info is not null && map.Info.FormatVersion < MapInfoFormatVersion.v15) || !Building(unitData));

    // In single precision, as World Editor works it out.
    private static string Facing(float radians) => (radians * 57.29578f).ToString("F3", CultureInfo.InvariantCulture);

    private string Variable(string name, string local) =>
        TriggerVariableReferences.TryGetValue(name, out var named) && named ? name : local;

    /// <inheritdoc />
    protected override void GenerateCreateUnits(Map map, IEnumerable<(UnitData Unit, int Id)> units, string playerNumberExpression, IndentedTextWriter writer)
    {
        writer.WriteLocal("player", "p", JassExpression.Invoke("Player", playerNumberExpression));
        writer.WriteLocal("unit", "u");
        writer.WriteLocal(JassKeyword.Integer, "unitID");
        writer.WriteLocal("trigger", "t");
        writer.WriteLocal(JassKeyword.Real, "life");
        writer.WriteLine();

        foreach (var (unit, id) in units.OrderBy(pair => pair.Unit.CreationNumber))
        {
            var name = Variable(unit.GetVariableName(), "u");
            if (unit.IsRandomUnit() || unit.IsRandomBuilding())
            {
                switch (unit.RandomData)
                {
                    case RandomUnitAny any:
                        writer.WriteSet("unitID", unit.IsRandomBuilding()
                            ? JassExpression.InvokeSpaced("ChooseRandomNPBuilding")
                            : JassExpression.InvokeSpaced("ChooseRandomCreep", JassLiteral.Int(any.Level)));
                        break;

                    case RandomUnitGlobalTable global:
                        // A random group's variable is numbered by the group's place in the map's list.
                        var place = map.Info?.RandomUnitTables?.FindIndex(table => table.Index == global.TableId) ?? -1;
                        writer.WriteSet("unitID", JassExpression.ElementAccess($"gg_rg_{(place >= 0 ? place : global.TableId):D3}", global.Column));
                        break;

                    case RandomUnitCustomTable custom:
                        writer.WriteCall("RandomDistReset");
                        var chances = 0;
                        foreach (var each in custom.RandomUnits)
                        {
                            writer.WriteCall(
                                "RandomDistAddItem",
                                RandomUnitProvider.IsRandomUnit(each.UnitId, out var level)
                                    ? JassExpression.Invoke("ChooseRandomCreep", JassLiteral.Int(level))
                                    : JassLiteral.FourCC(each.UnitId),
                                JassLiteral.Int(each.Chance));
                            chances += each.Chance;
                        }

                        if (chances < 100)
                        {
                            writer.WriteCall("RandomDistAddItem", "-1", JassLiteral.Int(100 - chances));
                        }

                        writer.WriteSet("unitID", JassExpression.InvokeSpaced("RandomDistChoose"));
                        break;
                }

                writer.WriteIf("(unitID != -1)");
                var made = new List<string> { "p", "unitID", JassLiteral.Real(unit.Position.X), JassLiteral.Real(unit.Position.Y), Facing(unit.Rotation) };
                if (ForceGenerateUnitWithSkin)
                {
                    made.Add("unitID");
                }

                writer.WriteSet(name, JassExpression.InvokeSpaced(ForceGenerateUnitWithSkin ? "BlzCreateUnitWithSkin" : "CreateUnit", [.. made]));
                WriteCreateUnitStatements(map, unit, id, writer);
                writer.WriteEndIf();
                continue;
            }

            var skin = unit.SkinId == 0 ? unit.TypeId : unit.SkinId;
            var withSkin = ForceGenerateUnitWithSkin || skin != unit.TypeId;
            var args = new List<string>
            {
                "p",
                JassLiteral.FourCC(unit.TypeId),
                JassLiteral.Real(unit.Position.X),
                JassLiteral.Real(unit.Position.Y),
                Facing(unit.Rotation),
            };
            if (withSkin)
            {
                args.Add(JassLiteral.FourCC(skin));
            }

            writer.WriteSet(name, JassExpression.InvokeSpaced(withSkin ? "BlzCreateUnitWithSkin" : "CreateUnit", [.. args]));
            if (unit.HeroLevel > 1)
            {
                writer.WriteCall("SetHeroLevel", name, JassLiteral.Int(unit.HeroLevel), JassKeyword.False);
            }

            if (unit.HeroStrength > 0)
            {
                writer.WriteCall("SetHeroStr", name, JassLiteral.Int(unit.HeroStrength), JassKeyword.True);
            }

            if (unit.HeroAgility > 0)
            {
                writer.WriteCall("SetHeroAgi", name, JassLiteral.Int(unit.HeroAgility), JassKeyword.True);
            }

            if (unit.HeroIntelligence > 0)
            {
                writer.WriteCall("SetHeroInt", name, JassLiteral.Int(unit.HeroIntelligence), JassKeyword.True);
            }

            WriteCreateUnitStatements(map, unit, id, writer);
        }
    }

    /// <inheritdoc />
    protected override void WriteCreateUnitStatements(Map map, UnitData unit, int id, IndentedTextWriter writer)
    {
        var name = Variable(unit.GetVariableName(), "u");
        if (unit.HP != -1)
        {
            writer.WriteSet("life", JassExpression.InvokeSpaced("GetUnitState", name, "UNIT_STATE_LIFE"));
            writer.WriteCall(
                "SetUnitState",
                name,
                "UNIT_STATE_LIFE",
                JassExpression.Multiply(JassLiteral.Real(unit.HP * 0.01f, 2), "life"));
        }

        if (unit.MP != -1)
        {
            writer.WriteCall("SetUnitState", name, "UNIT_STATE_MANA", JassLiteral.Int(unit.MP));
        }

        // A gold mine, or any unit given its ability.
        if (unit.IsGoldMine() || (_field(unit.TypeId.ToRawcode(), "uabi") ?? "").Split(',').Contains("Agld"))
        {
            writer.WriteCall("SetResourceAmount", name, JassLiteral.Int(unit.GoldAmount));
        }

        if (unit.TargetAcquisition != -1f)
        {
            writer.WriteCall("SetUnitAcquireRange", name, JassLiteral.Real(unit.TargetAcquisition == -2f ? 200f : unit.TargetAcquisition));
        }

        if (unit.WaygateDestinationRegionId != -1
            && map.Regions?.Regions.SingleOrDefault(region => region.CreationNumber == unit.WaygateDestinationRegionId) is { } to)
        {
            var region = "gg_rct_" + TriggerJass.Identifier(to.Name);
            writer.WriteCall("WaygateSetDestination", name, $"GetRectCenterX({region})", $"GetRectCenterY({region})");
            writer.WriteCall("WaygateActivate", name, JassKeyword.True);
        }

        // A unit's own colour counts only for a type that allows one (a waygate); else its type's colour (a Mercenary
        // Camp's) is set.
        var type = unit.TypeId.ToRawcode();
        var color = unit.CustomPlayerColorId != -1 && _field(type, "utcc") == "1" ? unit.CustomPlayerColorId
            : int.TryParse(_field(type, "utco"), out var standard) ? standard : -1;
        if (color != -1)
        {
            writer.WriteCall("SetUnitColor", name, JassExpression.Invoke("ConvertPlayerColor", JassLiteral.Int(color)));
        }

        foreach (var ability in unit.AbilityData)
        {
            var abilityId = ability.AbilityId.ToRawcode();
            for (var i = 0; i < ability.HeroAbilityLevel; i++)
            {
                writer.WriteCall("SelectHeroSkill", name, JassLiteral.FourCC(ability.AbilityId));
            }

            // An autocast ability is turned on or off by its order; one with no order to turn it on has only its order.
            var order = ability.IsAutocastActive
                ? _field(abilityId, "aoro") is { Length: > 0 } on ? on : _field(abilityId, "aord")
                : _field(abilityId, "aorf");
            if (order is { Length: > 0 })
            {
                writer.WriteCall("IssueImmediateOrder", name, JassLiteral.String(order));
            }
        }

        foreach (var item in unit.InventoryData)
        {
            writer.WriteCall("UnitAddItemToSlotById", name, JassLiteral.FourCC(item.ItemId), JassLiteral.Int(item.Slot));
        }

        if (unit.HasItemTable())
        {
            writer.WriteSet("t", JassExpression.InvokeSpaced("CreateTrigger"));
            writer.WriteCall("TriggerRegisterUnitEvent", "t", name, "EVENT_UNIT_DEATH");
            if (map.Info is null || map.Info.FormatVersion >= MapInfoFormatVersion.v24)
            {
                writer.WriteCall("TriggerRegisterUnitEvent", "t", name, "EVENT_UNIT_CHANGE_OWNER");
            }

            writer.WriteCall("TriggerAddAction", "t", JassExpression.FunctionRef(unit.GetDropItemsFunctionName(id)));
        }
    }

    /// <inheritdoc />
    protected override void GenerateCreateAllItems(Map map, IndentedTextWriter writer)
    {
        // World Editor 2.0 (editor 7000) and later set an item's colour; earlier ones keep no variable for it.
        var colored = (int)map.Info!.EditorVersion >= 7000;
        writer.WriteFunction("CreateAllItems");
        writer.WriteLocal(JassKeyword.Integer, "itemID");
        if (colored)
        {
            writer.WriteLocal("item", "i");
        }

        writer.WriteLine();
        var items = map.Units!.Units.Where(each => ShouldGenerateCreateAllItemsForItem(map, each)).ToArray();
        CrtSort(items, (a, b) => string.CompareOrdinal(a.TypeId.ToRawcode(), b.TypeId.ToRawcode()));
        foreach (var item in items)
        {
            var variable = $"gg_item_{item.TypeId.ToRawcode()}_{item.CreationNumber:D4}";
            var name = Variable(variable, "i");
            if (item.IsRandomItem())
            {
                switch (item.RandomData)
                {
                    case RandomUnitAny any:
                        writer.WriteSet("itemID", JassExpression.InvokeSpaced(RandomItem(any.Class, any.Level)));
                        break;

                    case RandomUnitCustomTable custom:
                        writer.WriteCall("RandomDistReset");
                        var chances = 0;
                        foreach (var each in custom.RandomUnits)
                        {
                            writer.WriteCall(
                                "RandomDistAddItem",
                                RandomItemProvider.IsRandomItem(each.UnitId, out var itemClass, out var level)
                                    ? RandomItem(itemClass, level)
                                    : JassLiteral.FourCC(each.UnitId),
                                JassLiteral.Int(each.Chance));
                            chances += each.Chance;
                        }

                        if (chances < 100)
                        {
                            writer.WriteCall("RandomDistAddItem", "-1", JassLiteral.Int(100 - chances));
                        }

                        writer.WriteSet("itemID", JassExpression.InvokeSpaced("RandomDistChoose"));
                        break;
                }

                writer.WriteIf("(itemID != -1)");
                var random = new[] { "itemID", JassLiteral.Real(item.Position.X), JassLiteral.Real(item.Position.Y) };
                if (!colored && name != variable)
                {
                    writer.WriteCall("CreateItem", random);
                }
                else
                {
                    writer.WriteSet(name, JassExpression.InvokeSpaced("CreateItem", random));
                }
                writer.WriteEndIf();
                continue;
            }

            var skin = item.SkinId == 0 ? item.TypeId : item.SkinId;
            var withSkin = ForceGenerateUnitWithSkin || skin != item.TypeId;
            var args = new List<string> { JassLiteral.FourCC(item.TypeId), JassLiteral.Real(item.Position.X), JassLiteral.Real(item.Position.Y) };
            if (withSkin)
            {
                args.Add(JassLiteral.FourCC(skin));
            }

            var made = JassExpression.InvokeSpaced(withSkin ? "BlzCreateItemWithSkin" : "CreateItem", [.. args]);
            if (!colored && name != variable)
            {
                writer.WriteCall(withSkin ? "BlzCreateItemWithSkin" : "CreateItem", [.. args]);
                continue;
            }

            writer.WriteSet(name, made);
            if (!colored)
            {
                continue;
            }

            // An item's team colour counts when its type allows one or is the map's own; else it is 0. Lua has the native's
            // newer name.
            var type = item.TypeId.ToRawcode();
            var color = (_field(type, "itcc") == "1" || _custom(type)) && int.TryParse(_field(type, "itco"), out var own) ? own : 0;
            writer.WriteCall(_lua ? "BlzSetItemColor" : "SetItemColor", name, JassExpression.Invoke("ConvertPlayerColor", JassLiteral.Int(color)));
        }

        writer.EndFunction();
    }

    // A random item of a class and level; for any class, World Editor 2.0 (editor 7000) and later use a function of its own.
    private string RandomItem(ItemClass itemClass, int level) => itemClass == ItemClass.Any && (int)_map.Info!.EditorVersion >= 7000
        ? JassExpression.InvokeSpaced("ChooseRandomItem", JassLiteral.Int(level))
        : JassExpression.InvokeSpaced("ChooseRandomItemEx", itemClass.GetVariableName(), JassLiteral.Int(level));

    /// <inheritdoc />
    protected override void WriteItemTableDropItemsStatements(Map map, IEnumerable<RandomItemSet> itemSets, bool chooseItemClass, IndentedTextWriter writer)
    {
        writer.WriteAlignedLocal("widget", "trigWidget", JassKeyword.Null);
        writer.WriteAlignedLocal("unit", "trigUnit", JassKeyword.Null);
        writer.WriteAlignedLocal(JassKeyword.Integer, "itemID", "0");
        writer.WriteAlignedLocal(JassKeyword.Boolean, "canDrop", JassKeyword.True);
        writer.WriteLine();
        writer.WriteSet("trigWidget", "bj_lastDyingWidget");
        writer.WriteIf("(trigWidget == null)");
        writer.WriteSet("trigUnit", "GetTriggerUnit()");
        writer.WriteEndIf();
        writer.WriteLine();
        writer.WriteIf("(trigUnit != null)");
        writer.WriteSet("canDrop", "not IsUnitHidden(trigUnit)");
        writer.WriteIf("(canDrop and GetChangingUnit() != null)");
        writer.WriteSet("canDrop", "(GetChangingUnitPrevOwner() == Player(PLAYER_NEUTRAL_AGGRESSIVE))");
        writer.WriteEndIf();
        writer.WriteEndIf();
        writer.WriteLine();
        writer.WriteIf("(canDrop)");
        var set = 0;
        foreach (var itemSet in itemSets)
        {
            writer.WriteComment($"Item set {set++}");
            writer.WriteCall("RandomDistReset");
            var chances = 0;
            foreach (var item in itemSet.Items)
            {
                // An item set's empty slot drops nothing.
                var dropped = item.ItemId == 0 ? "-1"
                    : RandomItemProvider.IsRandomItem(item.ItemId, out var itemClass, out var level)
                        ? chooseItemClass ? RandomItem(itemClass, level) : JassExpression.InvokeSpaced("ChooseRandomItem", JassLiteral.Int(level))
                        : JassLiteral.FourCC(item.ItemId);
                writer.WriteCall("RandomDistAddItem", dropped, JassLiteral.Int(item.Chance));
                chances += item.Chance;
            }

            if (chances < 100)
            {
                writer.WriteCall("RandomDistAddItem", "-1", JassLiteral.Int(100 - chances));
            }

            writer.WriteSet("itemID", JassExpression.InvokeSpaced("RandomDistChoose"));
            writer.WriteIf("(trigUnit != null)");
            writer.WriteCall("UnitDropItem", "trigUnit", "itemID");
            writer.WriteElse();
            writer.WriteCall("WidgetDropItem", "trigWidget", "itemID");
            writer.WriteEndIf();
            writer.WriteLine();
        }

        writer.WriteEndIf();
        writer.WriteLine();
        writer.WriteSet("bj_lastDyingWidget", JassKeyword.Null);
        writer.WriteCallCompact("DestroyTrigger", JassExpression.Invoke("GetTriggeringTrigger"));
    }

    // World Editor lists the items by type with the C runtime's qsort (Microsoft's), which does not keep the order of
    // items of one type: this is that sort, so they come out in its order. Checked against every map of the install.
    private static void CrtSort<T>(T[] items, Comparison<T> compare)
    {
        void Swap(int a, int b) => (items[a], items[b]) = (items[b], items[a]);
        if (items.Length < 2)
        {
            return;
        }

        var stack = new Stack<(int Lo, int Hi)>();
        var (lo, hi) = (0, items.Length - 1);
        while (true)
        {
            var size = hi - lo + 1;
            if (size <= 8)
            {
                // Short runs: the largest to the end, again and again.
                for (var end = hi; end > lo; end--)
                {
                    var max = lo;
                    for (var i = lo + 1; i <= end; i++)
                    {
                        max = compare(items[i], items[max]) > 0 ? i : max;
                    }

                    Swap(max, end);
                }
            }
            else
            {
                var mid = lo + (size / 2);
                if (compare(items[lo], items[mid]) > 0)
                {
                    Swap(lo, mid);
                }

                if (compare(items[lo], items[hi]) > 0)
                {
                    Swap(lo, hi);
                }

                if (compare(items[mid], items[hi]) > 0)
                {
                    Swap(mid, hi);
                }

                var (up, down) = (lo, hi);
                while (true)
                {
                    if (mid > up)
                    {
                        do
                        {
                            up++;
                        }
                        while (up < mid && compare(items[up], items[mid]) <= 0);
                    }

                    if (mid <= up)
                    {
                        do
                        {
                            up++;
                        }
                        while (up <= hi && compare(items[up], items[mid]) <= 0);
                    }

                    do
                    {
                        down--;
                    }
                    while (down > mid && compare(items[down], items[mid]) > 0);

                    if (down < up)
                    {
                        break;
                    }

                    Swap(up, down);
                    if (mid == down)
                    {
                        mid = up;
                    }
                }

                down++;
                if (mid < down)
                {
                    do
                    {
                        down--;
                    }
                    while (down > mid && compare(items[down], items[mid]) == 0);
                }

                if (mid >= down)
                {
                    do
                    {
                        down--;
                    }
                    while (down > lo && compare(items[down], items[mid]) == 0);
                }

                if (down - lo >= hi - up)
                {
                    if (lo < down)
                    {
                        stack.Push((lo, down));
                    }

                    if (up < hi)
                    {
                        lo = up;
                        continue;
                    }
                }
                else
                {
                    if (up < hi)
                    {
                        stack.Push((up, hi));
                    }

                    if (lo < down)
                    {
                        hi = down;
                        continue;
                    }
                }
            }

            if (stack.Count == 0)
            {
                return;
            }

            (lo, hi) = stack.Pop();
        }
    }
}
