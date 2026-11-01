<script module lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";

// The caret and the selection stay the browser's: CodeMirror's own are drawn from sizes the grid's scale changes.
const look = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "var(--code-bg)", color: "var(--code-fg)" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.45" },
    ".cm-content": { caretColor: "var(--code-fg)", padding: "3px 0" },
    ".cm-content ::selection": { backgroundColor: "var(--code-selection)" },
    ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "var(--code-gutter)" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 6px 0 5px" },
    "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--code-selection)" },
  },
  { dark: true },
);

const everyBox = [
  lineNumbers(),
  history(),
  bracketMatching(),
  EditorView.lineWrapping,
  keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
  look,
];
</script>

<script lang="ts">
/**
 * A script's text, in CodeMirror (Sven, 2026-10-31): the map's language in colour, line numbers, Tab to indent and its own
 * undo. What is typed is sent as in any box: when it loses the focus, or when a save asks. A read-only script can still be
 * selected and copied.
 */
import { onMount } from "svelte";
import { languageOf, type ScriptLanguage, scriptHighlight } from "./scriptLanguages.ts";
import { typedText } from "./typedBox.ts";

type Props = {
  value: string;
  language: ScriptLanguage;
  label: string;
  readOnly: boolean;
  /** On a card it grows with its text up to a limit; in a panel it takes the room left. */
  size?: "card" | "panel";
  onsend: (text: string) => void;
};

let { value, language, label, readOnly, size = "card", onsend }: Props = $props();

let holder: HTMLDivElement | undefined = $state();
let view: EditorView | undefined;

const sizes = {
  card: "min-h-[54px] rounded-[5px] border border-line text-[11px] focus-within:border-accent [&_.cm-editor]:max-h-[262px]",
  panel: "min-h-[320px] flex-1 rounded-[5px] border border-line text-[12.5px] focus-within:border-accent",
};

onMount(() => {
  const typed = typedText(
    () => made.state.doc.toString(),
    (text) => onsend(text),
  );
  const made = new EditorView({
    parent: holder,
    state: EditorState.create({
      doc: value,
      extensions: [
        everyBox,
        languageOf(language),
        scriptHighlight,
        EditorState.readOnly.of(readOnly),
        EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false" }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && update.transactions.some((each) => !each.annotation(Transaction.remote))) {
            typed.changed();
          }
        }),
        EditorView.domEventHandlers({ blur: () => typed.send() }),
      ],
    }),
  });
  view = made;
  return () => {
    typed.send();
    made.destroy();
  };
});

// The map's text, after an edit elsewhere or an undo.
$effect(() => {
  const text = value;
  const state = view?.state;
  if (!view || !state || state.toText(text).eq(state.doc)) return;
  view.dispatch({
    changes: { from: 0, to: state.doc.length, insert: text },
    annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
  });
});
</script>

<div bind:this={holder} class="overflow-hidden {sizes[size]} {readOnly ? 'opacity-60' : ''}"></div>
