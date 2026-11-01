import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { codeTokens } from "../codeThemes.ts";
import { languageOf, type ScriptLanguage, scriptColours } from "./scriptLanguages.ts";

const named = tagHighlighter([
  { tag: tags.keyword, class: "keyword" },
  { tag: tags.string, class: "string" },
  { tag: tags.comment, class: "comment" },
  { tag: tags.number, class: "number" },
]);

/** The text of each piece of a script the language gives this style. */
function styled(language: ScriptLanguage, doc: string, style: string): string[] {
  const state = EditorState.create({ doc, extensions: [languageOf(language)] });
  const tree = ensureSyntaxTree(state, doc.length, 1000);
  if (!tree) throw new Error("not parsed");
  const found: string[] = [];
  highlightTree(tree, named, (from, to, classes) => {
    if (classes === style) found.push(doc.slice(from, to));
  });
  return found;
}

describe("languageOf", () => {
  it("reads JASS", () => {
    const doc = 'local string s = "a" // c';
    expect(styled("jass", doc, "keyword")).toEqual(["local"]);
    expect(styled("jass", doc, "string")).toEqual(['"a"']);
    expect(styled("jass", doc, "comment")).toEqual(["// c"]);
  });

  it("reads Lua", () => {
    const doc = 'local s = "a" -- c';
    expect(styled("lua", doc, "keyword")).toEqual(["local"]);
    expect(styled("lua", doc, "string")).toEqual(['"a"']);
    expect(styled("lua", doc, "comment")).toEqual(["-- c"]);
  });

  it("reads C#", () => {
    const doc = 'public class Boom { string s = "a"; } // c';
    expect(styled("csharp", doc, "keyword")).toContain("public");
    expect(styled("csharp", doc, "string")).toEqual(['"a"']);
    expect(styled("csharp", doc, "comment")).toEqual(["// c"]);
  });
});

describe("scriptColours", () => {
  it("takes every colour from the code theme, so a script follows the one chosen", () => {
    for (const { color } of scriptColours) {
      const token = color?.match(/^var\(--(.+)\)$/)?.[1];
      expect(codeTokens).toContain(token);
    }
  });
});
