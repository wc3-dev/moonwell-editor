/**
 * What a script box reads and how it colours it (Sven, 2026-10-31). Every colour is one of the code theme's tokens, so a
 * script follows the one chosen in the settings.
 */
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
  type TagStyle,
} from "@codemirror/language";
import { csharp } from "@codemirror/legacy-modes/mode/clike";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { jass } from "./jass.ts";

export type ScriptLanguage = "jass" | "lua" | "csharp";

const languages: Record<ScriptLanguage, Extension> = {
  jass: StreamLanguage.define(jass),
  lua: StreamLanguage.define(lua),
  csharp: StreamLanguage.define(csharp),
};

export function languageOf(language: ScriptLanguage): Extension {
  return languages[language];
}

export const scriptColours: TagStyle[] = [
  { tag: tags.keyword, color: "var(--code-keyword)" },
  { tag: tags.typeName, color: "var(--code-type)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--code-string)" },
  { tag: [tags.number, tags.atom], color: "var(--code-number)" },
  { tag: tags.comment, color: "var(--code-comment)" },
  { tag: tags.function(tags.variableName), color: "var(--code-function)" },
  { tag: tags.special(tags.variableName), color: "var(--code-special)" },
  { tag: tags.definition(tags.variableName), color: "var(--code-fg)" },
  { tag: tags.operator, color: "var(--code-operator)" },
];

export const scriptHighlight = syntaxHighlighting(HighlightStyle.define(scriptColours));
