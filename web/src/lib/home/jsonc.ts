/**
 * Reading the editor's JSON files, which allow comments and trailing commas as VS Code's do (Sven, 2026-11-02). What is
 * wrong with a file is a `Problem` with a code, never a sentence, so the page can say it in the language it shows.
 */
import { type Node, type ParseError, parse, parseTree, visit } from "jsonc-parser";

export type ProblemCode =
  | "notJson"
  | "noName"
  | "badType"
  | "missing"
  | "badColor"
  | "unknownKey"
  | "badValue"
  | "unreadable";

export type Problem = { code: ProblemCode; key?: string; line?: number };

const options = { allowTrailingComma: true };

const lineAt = (text: string, offset: number): number => text.slice(0, offset).split("\n").length;

// Editors that save a byte order mark put one before the first character; it is not part of the JSON.
const withoutMark = (text: string): string => (text.startsWith("\uFEFF") ? text.slice(1) : text);

/** What a file holds, or the one `notJson` problem, with the line of the first mistake, when it can't be read. */
export function parseJsonc(whole: string): { value: unknown; problems: Problem[] } {
  const text = withoutMark(whole);
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, options);
  const [first] = errors;
  if (first)
    return { value: undefined, problems: [{ code: "notJson", line: lineAt(text, first.offset) }] };
  return { value, problems: [] };
}

/** The line, counted from 1, of the first property called `key` anywhere in the file. */
export function lineOfKey(whole: string, key: string): number | undefined {
  let line: number | undefined;
  visit(
    withoutMark(whole),
    {
      onObjectProperty(property, _offset, _length, startLine) {
        if (line === undefined && property === key) line = startLine + 1;
      },
    },
    options,
  );
  return line;
}

// White space and comments, which can stand between any two tokens.
const trivia = /^(?:\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)*/;

/** True when the file has nothing in it but white space and comments. */
export function isBlank(text: string): boolean {
  const rest = withoutMark(text);
  return trivia.exec(rest)?.[0].length === rest.length;
}

/** True for a JSON object: not a list, not null. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The object a file holds: empty for no file (`null`) and for a file with nothing in it. A text that can't be read as
 * JSON, or is JSON of another kind, is one `notJson` problem (the line of the first mistake, or 1) and an empty object.
 */
export function parseObject(text: string | null): {
  root: Record<string, unknown>;
  problems: Problem[];
} {
  if (text === null || isBlank(text)) return { root: {}, problems: [] };
  const { value, problems } = parseJsonc(text);
  if (problems.length > 0) return { root: {}, problems };
  if (!isRecord(value)) return { root: {}, problems: [{ code: "notJson", line: 1 }] };
  return { root: value, problems: [] };
}

/** Where the next token after `offset` is, when it is a comma. */
function commaAfter(text: string, offset: number): number | undefined {
  const at = offset + (trivia.exec(text.slice(offset))?.[0].length ?? 0);
  return text[at] === "," ? at : undefined;
}

/**
 * The text without the last property `key`, the one that counts when a key is written twice, or undefined when there
 * is none. Only the property goes, with its comma and the comment after it on its line: the comments above it and next
 * to it stay, which `modify` would take with it.
 */
function removeLastKey(text: string, key: string): string | undefined {
  const root = parseTree(text, [], options);
  const properties = root?.type === "object" ? (root.children ?? []) : [];
  const at = properties.findLastIndex((each) => each.children?.[0]?.value === key);
  const property = properties[at];
  if (!property) return undefined;

  const cuts: { from: number; to: number }[] = [];
  let from = property.offset;
  let to = property.offset + property.length;
  const comma = commaAfter(text, to);
  if (comma !== undefined) to = comma + 1;
  else {
    // The last one: the one before it gives up its comma.
    const before = properties[at - 1];
    const previous = before ? commaAfter(text, before.offset + before.length) : undefined;
    if (previous !== undefined) cuts.push({ from: previous, to: previous + 1 });
  }

  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  const rest = /^[ \t]*(?:\/\/[^\r\n]*)?(?:\r?\n|$)/.exec(text.slice(to));
  if (/^[ \t]*$/.test(text.slice(lineStart, from)) && rest) {
    // Alone on its line: the whole line goes.
    from = lineStart;
    to += rest[0].length;
  } else if (comma !== undefined) to += /^[ \t]*/.exec(text.slice(to))?.[0].length ?? 0;
  else from -= /[ \t]*$/.exec(text.slice(0, from))?.[0].length ?? 0;
  cuts.push({ from, to });

  return cuts
    .sort((a, b) => b.from - a.from)
    .reduce((result, cut) => result.slice(0, cut.from) + result.slice(cut.to), text);
}

/**
 * The text without the property `key`, every time it is written: a file is read with the last of a key written twice,
 * so a reset that left an earlier one would bring its value back at the next start.
 */
function removeKey(text: string, key: string): string {
  let result = text;
  for (let next = removeLastKey(result, key); next !== undefined; next = removeLastKey(result, key))
    result = next;
  return result;
}

// What may follow a property on its line: comments (each ends at its first `*/`, which keeps the match linear), then
// the line's end.
const lineRest =
  /^[ \t]*(?:\/\*[^*\r\n]*(?:\*(?!\/)[^*\r\n]*)*\*\/[ \t]*)*(?:\/\/[^\r\n]*)?(?:\r?\n|$)/;

/**
 * The text with a new property at the end of the object `root`. A property on a line of its own goes on a new line
 * below the last one, indented as that one is, and only the comma after the last value is added to the last line, so
 * its comment, its indentation and an array or object on it stay as they were. Properties on one line go after the
 * last one on that line.
 */
function addKey(text: string, root: Node, key: string, value: unknown): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const entry = `${JSON.stringify(key)}: ${JSON.stringify(value)}`;
  const last = root.children?.at(-1);
  const close = root.offset + root.length - 1;

  if (!last) {
    const closeLine = text.lastIndexOf("\n", close - 1) + 1;
    if (/^\s*$/.test(text.slice(root.offset + 1, close))) {
      return `${text.slice(0, root.offset + 1)}${eol}  ${entry}${eol}${text.slice(close)}`;
    }
    if (/^[ \t]*$/.test(text.slice(closeLine, close))) {
      return `${text.slice(0, closeLine)}  ${entry}${eol}${text.slice(closeLine)}`;
    }
    return `${text.slice(0, close)}${eol}  ${entry}${eol}${text.slice(close)}`;
  }

  const end = last.offset + last.length;
  const comma = commaAfter(text, end);
  const after = comma === undefined ? end : comma + 1;
  const lineStart = text.lastIndexOf("\n", last.offset - 1) + 1;
  const indent = text.slice(lineStart, last.offset);
  const rest = /^[ \t]*$/.test(indent) ? lineRest.exec(text.slice(after)) : null;
  if (!rest) return `${text.slice(0, end)}, ${entry}${text.slice(end)}`;

  const lineEnd = after + rest[0].length;
  const newLine = rest[0].endsWith("\n") ? "" : eol;
  const separator = comma === undefined ? "," : "";
  const trailing = comma === undefined ? "" : ",";
  return `${text.slice(0, end)}${separator}${text.slice(end, lineEnd)}${newLine}${indent}${entry}${trailing}${eol}${text.slice(lineEnd)}`;
}

/** The text with the value of the property `key` replaced by `value`, or `text` when it has no such property. */
function changeKey(text: string, root: Node, key: string, value: unknown): string | undefined {
  const property = root.children?.findLast((each) => each.children?.[0]?.value === key);
  const old = property?.children?.[1];
  if (!old) return undefined;
  return `${text.slice(0, old.offset)}${JSON.stringify(value)}${text.slice(old.offset + old.length)}`;
}

/**
 * The text with `key` set to `value` (a key with a dot in it is one key), or removed when `value` is `undefined`. The
 * rest of the text stays as it was: comments, order, indentation and line ends. A new key goes last, indented as the
 * last one is (2 spaces in an empty object), and a value is written on one line.
 */
export function setKey(text: string, key: string, value: unknown | undefined): string {
  if (value === undefined) return removeKey(text, key);
  const root = parseTree(text, [], options);
  if (root?.type !== "object") {
    if (!isBlank(text)) return text;
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const body = `{${eol}  ${JSON.stringify(key)}: ${JSON.stringify(value)}${eol}}${eol}`;
    return text === "" || text.endsWith("\n") ? text + body : text + eol + body;
  }
  return changeKey(text, root, key, value) ?? addKey(text, root, key, value);
}
