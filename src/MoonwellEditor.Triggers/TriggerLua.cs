using System.Text.RegularExpressions;
using War3Net.CodeAnalysis.Jass;
using War3Net.CodeAnalysis.Jass.Syntax;

namespace MoonwellEditor.Triggers;

/// <summary>
/// World Editor's Lua for the JASS it writes for triggers, line for line: no indent and no comment, spaces as World
/// Editor's Lua has them, <c>..</c> for text joined with <c>+</c> and <c>//</c> for whole numbers divided. A custom script
/// line is the map's own Lua: it keeps the JASS line's indent and is not read. Checked against World Editor's script of
/// every Lua map of the install.
/// </summary>
internal sealed partial class TriggerLua(ScriptTypes types)
{
    /// <summary>Starts a custom script line in the JASS that a Lua map's triggers are first written as.</summary>
    public const char UserCode = '\u0001';

    private readonly Dictionary<string, string> _locals = new(StringComparer.Ordinal);

    /// <summary>The Lua lines of <paramref name="jass"/>, lines of JASS as World Editor writes them for triggers.</summary>
    public List<string> Lines(IEnumerable<string> jass)
    {
        var lines = new List<string>();
        foreach (var line in jass)
        {
            var text = line.Trim();
            if (text.Length > 0 && text[0] == UserCode)
            {
                lines.Add(line.Remove(line.IndexOf(UserCode, StringComparison.Ordinal), 1));
            }
            else if (!text.StartsWith("//", StringComparison.Ordinal))
            {
                lines.Add(Line(text));
            }
        }

        return lines;
    }

    [GeneratedRegex(@"^function (\w+) takes (.+) returns (\w+)$")]
    private static partial Regex Declarator();

    private string Line(string text)
    {
        switch (text)
        {
            case "":
                return "";
            case "endfunction":
                _locals.Clear();
                return "end";
            case "endif" or "endloop":
                return "end";
            case "else":
                return "else";
            case "loop":
                return "while (true) do";
        }

        if (Declarator().Match(text) is { Success: true } function)
        {
            return Function(function.Groups[1].Value, function.Groups[2].Value, function.Groups[3].Value);
        }

        if (text.StartsWith("if ", StringComparison.Ordinal) && text.EndsWith(" then", StringComparison.Ordinal))
        {
            return $"if {Expression(text["if ".Length..^" then".Length])} then";
        }

        if (text.StartsWith("elseif ", StringComparison.Ordinal) && text.EndsWith(" then", StringComparison.Ordinal))
        {
            return $"elseif {Expression(text["elseif ".Length..^" then".Length])} then";
        }

        return Statement(JassSyntaxFactory.ParseStatement(text));
    }

    private string Function(string name, string parameters, string returns)
    {
        types.AddFunction(name, returns);
        var names = new List<string>();
        if (parameters != "nothing")
        {
            foreach (var parameter in parameters.Split(','))
            {
                var parts = parameter.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                _locals[parts[1]] = parts[0];
                names.Add(parts[1]);
            }
        }

        return $"function {name}({string.Join(", ", names)})";
    }

    private string Statement(JassStatementSyntax statement) => statement switch
    {
        JassCallStatementSyntax call => call.IdentifierName.Token.Text + Arguments(call.IdentifierName.Token.Text, call.ArgumentList),
        JassSetStatementSyntax set => set.IdentifierName.Token.Text
            + (set.ElementAccessClause is { } index ? $"[{Print(index.Expression)}]" : "")
            + " = " + Print(set.Value.Expression),
        JassLocalVariableDeclarationStatementSyntax local => Local(local.Declarator),
        JassExitStatementSyntax exit => $"if ({Print(exit.Condition)}) then break end",
        JassReturnStatementSyntax { Value: null } => "return ",
        JassReturnStatementSyntax returns => "return " + Print(returns.Value),
        _ => throw new InvalidDataException("No Lua for this JASS: " + statement),
    };

    private string Local(JassVariableOrArrayDeclaratorSyntax declarator)
    {
        switch (declarator)
        {
            case JassVariableDeclaratorSyntax variable:
                _locals[variable.IdentifierName.Token.Text] = TypeName(variable.Type);
                return variable.Value == null
                    ? "local " + variable.IdentifierName.Token.Text
                    : $"local {variable.IdentifierName.Token.Text} = {Print(variable.Value.Expression)}";
            case JassArrayDeclaratorSyntax array:
                _locals[array.IdentifierName.Token.Text] = TypeName(array.Type);
                return $"local {array.IdentifierName.Token.Text} = {NewArray(TypeName(array.Type))}";
            default:
                throw new InvalidDataException("No Lua for this JASS: " + declarator);
        }
    }

    /// <summary>A new array of a script type, as World Editor's Lua makes it: one with a default for a value type.</summary>
    public static string NewArray(string type) => type switch
    {
        "integer" => "__jarray(0)",
        "real" => "__jarray(0.0)",
        "boolean" => "__jarray(false)",
        "string" => "__jarray(\"\")",
        _ => "{}",
    };

    private static string TypeName(JassTypeSyntax type) => type switch
    {
        JassPredefinedTypeSyntax predefined => predefined.Token.Text,
        JassIdentifierNameSyntax name => name.Token.Text,
        _ => "",
    };

    private string Expression(string text) => Print(JassSyntaxFactory.ParseExpression(text));

    // A null given for text is empty text.
    private string Arguments(string function, JassArgumentListSyntax arguments) =>
        $"({string.Join(", ", arguments.ArgumentList.Items.Select((argument, index) =>
            argument is JassLiteralExpressionSyntax { Token.SyntaxKind: JassSyntaxKind.NullKeyword }
            && types.Parameter(function, index) == "string"
                ? "\"\""
                : Print(argument)))})";

    private string Print(JassExpressionSyntax expression) => expression switch
    {
        JassLiteralExpressionSyntax literal => Literal(literal.Token),
        JassIdentifierNameSyntax name => name.Token.Text,
        JassParenthesizedExpressionSyntax { Expression: JassParenthesizedExpressionSyntax inner } => Print(inner),
        JassParenthesizedExpressionSyntax inner => $"({Print(inner.Expression)})",
        JassUnaryExpressionSyntax { OperatorToken.SyntaxKind: JassSyntaxKind.NotKeyword } not => "not " + Print(not.Expression),
        JassUnaryExpressionSyntax unary => unary.OperatorToken.Text + Print(unary.Expression),
        JassBinaryExpressionSyntax binary => $"{Print(binary.Left)} {Operator(binary)} {Print(binary.Right)}",
        JassInvocationExpressionSyntax call => call.IdentifierName.Token.Text + Arguments(call.IdentifierName.Token.Text, call.ArgumentList),
        JassFunctionReferenceExpressionSyntax reference => reference.IdentifierName.Token.Text,
        JassElementAccessExpressionSyntax element =>
            $"{element.IdentifierName.Token.Text}[{Print(element.ElementAccessClause.Expression)}]",
        _ => throw new InvalidDataException("No Lua for this JASS: " + expression),
    };

    private static string Literal(JassSyntaxToken token) => token.SyntaxKind switch
    {
        JassSyntaxKind.NullKeyword => "nil",
        JassSyntaxKind.FourCCLiteralToken => $"FourCC(\"{token.Text[1..^1]}\")",
        JassSyntaxKind.HexadecimalLiteralToken when token.Text.StartsWith('$') => "0x" + token.Text[1..],
        _ => token.Text,
    };

    private string Operator(JassBinaryExpressionSyntax binary) => binary.OperatorToken.SyntaxKind switch
    {
        JassSyntaxKind.ExclamationEqualsToken => "~=",
        JassSyntaxKind.PlusToken when TypeOf(binary.Left) == "string" || TypeOf(binary.Right) == "string" => "..",
        JassSyntaxKind.SlashToken when TypeOf(binary.Left) == "integer" && TypeOf(binary.Right) == "integer" => "//",
        _ => binary.OperatorToken.Text,
    };

    // The script type of what an expression gives; null when it is not known.
    private string? TypeOf(JassExpressionSyntax expression) => expression switch
    {
        JassLiteralExpressionSyntax literal => literal.Token.SyntaxKind switch
        {
            JassSyntaxKind.RealLiteralToken => "real",
            JassSyntaxKind.StringLiteralToken => "string",
            JassSyntaxKind.TrueKeyword or JassSyntaxKind.FalseKeyword => "boolean",
            JassSyntaxKind.NullKeyword => null,
            _ => "integer",
        },
        JassIdentifierNameSyntax name => VariableType(name.Token.Text),
        JassElementAccessExpressionSyntax element => VariableType(element.IdentifierName.Token.Text),
        JassInvocationExpressionSyntax call => types.Function(call.IdentifierName.Token.Text),
        JassParenthesizedExpressionSyntax inner => TypeOf(inner.Expression),
        JassUnaryExpressionSyntax { OperatorToken.SyntaxKind: JassSyntaxKind.NotKeyword } => "boolean",
        JassUnaryExpressionSyntax unary => TypeOf(unary.Expression),
        JassBinaryExpressionSyntax binary => binary.OperatorToken.SyntaxKind switch
        {
            JassSyntaxKind.PlusToken or JassSyntaxKind.MinusToken or JassSyntaxKind.AsteriskToken or JassSyntaxKind.SlashToken =>
                Arithmetic(TypeOf(binary.Left), TypeOf(binary.Right)),
            _ => "boolean",
        },
        _ => null,
    };

    private static string? Arithmetic(string? left, string? right) =>
        left == "string" || right == "string" ? "string"
        : left == "real" || right == "real" ? "real"
        : left == "integer" && right == "integer" ? "integer"
        : null;

    private string? VariableType(string name) => _locals.GetValueOrDefault(name) ?? types.Global(name);
}

/// <summary>
/// The script types of the game's functions and globals (<c>common.j</c>, <c>Blizzard.j</c>) and of a map's own, which
/// say how World Editor's Lua writes a <c>+</c> or a <c>/</c>. A user type stands for the type it is made of.
/// </summary>
public sealed partial class ScriptTypes
{
    private readonly Dictionary<string, string> _functions = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _globals = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string[]> _parameters = new(StringComparer.Ordinal);

    private ScriptTypes()
    {
    }

    /// <summary>The types of the functions and globals declared in <paramref name="scripts"/>, JASS files.</summary>
    public static ScriptTypes Read(params string?[] scripts)
    {
        var types = new ScriptTypes();
        foreach (var script in scripts.OfType<string>())
        {
            var inGlobals = false;
            foreach (var line in script.Split('\n'))
            {
                var text = line.Trim();
                if (text == "globals" || text == "endglobals")
                {
                    inGlobals = text == "globals";
                }
                else if (inGlobals && Global().Match(text) is { Success: true } global)
                {
                    types._globals[global.Groups[2].Value] = global.Groups[1].Value;
                }
                else if (Function().Match(text) is { Success: true } function)
                {
                    types._functions[function.Groups[1].Value] = function.Groups[3].Value;
                    types._parameters[function.Groups[1].Value] = function.Groups[2].Value == "nothing"
                        ? []
                        : [.. function.Groups[2].Value.Split(',').Select(parameter => parameter.Trim().Split(' ')[0])];
                }
            }
        }

        return types;
    }

    /// <summary>A copy, to which a map's own are added.</summary>
    public ScriptTypes Copy()
    {
        var copy = new ScriptTypes();
        foreach (var (name, type) in _functions)
        {
            copy._functions[name] = type;
        }

        foreach (var (name, type) in _globals)
        {
            copy._globals[name] = type;
        }

        foreach (var (name, parameters) in _parameters)
        {
            copy._parameters[name] = parameters;
        }

        return copy;
    }

    /// <summary>What a function returns; null when it is not known.</summary>
    public string? Function(string name) => _functions.GetValueOrDefault(name);

    /// <summary>The type of a function's parameter, by its number from 0; null when it is not known.</summary>
    public string? Parameter(string function, int index) =>
        _parameters.TryGetValue(function, out var parameters) && index < parameters.Length ? parameters[index] : null;

    /// <summary>A global's type (an array's, its items'); null when it is not known.</summary>
    public string? Global(string name) => _globals.GetValueOrDefault(name);

    /// <summary>Adds a function.</summary>
    public void AddFunction(string name, string returns) => _functions[name] = returns;

    /// <summary>Adds a global.</summary>
    public void AddGlobal(string name, string type) => _globals[name] = type;

    [GeneratedRegex(@"^(?:constant\s+)?(\w+)\s+(?:array\s+)?(\w+)\s*(?:=|$)")]
    private static partial Regex Global();

    [GeneratedRegex(@"^(?:constant\s+)?(?:native|function)\s+(\w+)\s+takes\s+(.+?)\s+returns\s+(\w+)")]
    private static partial Regex Function();
}
