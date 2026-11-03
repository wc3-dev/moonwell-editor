using MoonwellEditor.BridgeTypes;

if (args.Length != 1)
{
    Console.Error.WriteLine("Writes the page's bridge types. Usage: MoonwellEditor.BridgeTypes <file to write>");
    return 2;
}

var path = Path.GetFullPath(args[0]);
var text = BridgeFile.Write();
if (!File.Exists(path) || File.ReadAllText(path).Replace("\r\n", "\n", StringComparison.Ordinal) != text)
{
    File.WriteAllText(path, text);
    Console.WriteLine("Wrote " + path);
}

return 0;
