/**
 * JASS for CodeMirror, which has no grammar of its own for it: a stream parser (Sven, 2026-10-31). A word's meaning comes
 * from what came before it on the line, or at the start of a line in `globals`, as JASS has no other way to tell a type
 * from a name. Plain JASS only: vJass's words read as names.
 */
import type { StreamParser, StringStream } from "@codemirror/language";
import { tags } from "@lezer/highlight";

type State = {
  /** A string runs on to the next line. */
  inString: boolean;
  inGlobals: boolean;
  /** Between `takes` and `returns`, where a comma comes before a type. */
  inParameters: boolean;
  /** What the next word is, whatever it is called. */
  next: "type" | "name" | null;
};

const keywords = new Set(
  "and array call constant else elseif endfunction endglobals endif endloop exitwhen extends function globals if local loop native not nothing or return returns set takes then type".split(
    " ",
  ),
);
const atoms = new Set(["true", "false", "null"]);
const numbers = [/^\$[0-9a-fA-F]+/, /^0[xX][0-9a-fA-F]+/, /^\d+\.\d*/, /^\.\d+/, /^\d+/];

// What a keyword says about the words after it.
function afterKeyword(word: string, state: State): void {
  if (word === "array") return; // between a type and its name
  state.next = null;
  if (word === "function" || word === "native" || word === "type") state.next = "name";
  if (word === "local" || word === "constant" || word === "extends") state.next = "type";
  if (word === "takes") {
    state.inParameters = true;
    state.next = "type";
  }
  if (word === "returns") {
    state.inParameters = false;
    state.next = "type";
  }
  if (word === "globals") state.inGlobals = true;
  if (word === "endglobals") state.inGlobals = false;
}

function word(stream: StringStream, state: State): string | null {
  const text = stream.current();
  if (keywords.has(text)) {
    afterKeyword(text, state);
    return "keyword";
  }
  if (atoms.has(text)) {
    state.next = null;
    return "atom";
  }
  if (state.next === "type") {
    state.next = "name";
    return "type";
  }
  if (state.next === "name") {
    state.next = null;
    return "def";
  }
  if (text.startsWith("udg_") || text.startsWith("gg_")) return "global";
  return stream.match(/^\s*\(/, false) ? "call" : null;
}

function string(stream: StringStream, state: State): string {
  while (!stream.eol()) {
    const each = stream.next();
    if (each === "\\") stream.next();
    else if (each === '"') {
      state.inString = false;
      return "string";
    }
  }
  state.inString = true;
  return "string";
}

export const jass: StreamParser<State> = {
  name: "jass",
  startState: () => ({ inString: false, inGlobals: false, inParameters: false, next: null }),
  token(stream, state) {
    if (stream.sol()) {
      state.inParameters = false;
      state.next = state.inGlobals ? "type" : null;
    }
    if (state.inString) return string(stream, state);
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.eat('"')) return string(stream, state);
    if (stream.match(/^'(?:\\.|[^'\\])*'/)) return "number";
    if (numbers.some((number) => stream.match(number))) return "number";
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) return word(stream, state);
    if (stream.match(/^(?:==|!=|<=|>=)/)) return "operator";
    const each = stream.next();
    if (each === "," && state.inParameters) state.next = "type";
    return each !== undefined && "+-*/=<>()[],".includes(each) ? "operator" : null;
  },
  languageData: { commentTokens: { line: "//" } },
  tokenTable: {
    call: tags.function(tags.variableName),
    global: tags.special(tags.variableName),
  },
};
