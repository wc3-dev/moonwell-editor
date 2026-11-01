/**
 * One Monaco editor and a document per open script, so each keeps its undo, and comes back with its caret and scroll. A
 * document is a file in VS Code's own file system, in memory, held by a reference: VS Code disposes one made any other way,
 * and a language server will want files. What is typed is sent as in any box: when the editor loses the focus, or when a
 * save asks (`typedText`).
 */
import { createModelReference } from "@codingame/monaco-vscode-api/monaco";
import * as monaco from "@codingame/monaco-vscode-editor-api";
import type { CodeTheme } from "../../codeThemes.ts";
import { typedText } from "../../triggers/typedBox.ts";
import { setEditorTheme, startMonaco } from "./setup.ts";

export type ScriptsEditorOptions = {
  readOnly: boolean;
  theme: CodeTheme;
  onsend: (id: number, text: string) => void;
};

type Open = {
  reference: Awaited<ReturnType<typeof createModelReference>>;
  model: monaco.editor.ITextModel;
  typed: ReturnType<typeof typedText>;
  state: monaco.editor.ICodeEditorViewState | null;
};

const files = { jass: "j", lua: "lua", csharp: "cs" };

export class ScriptsEditor {
  private readonly open = new Map<number, Promise<Open>>();
  private shown: { id: number; script: Open } | null = null;
  // True while the map's text goes in, which is not typing.
  private setting = false;

  private constructor(
    private readonly editor: monaco.editor.IStandaloneCodeEditor,
    private readonly onsend: (id: number, text: string) => void,
  ) {
    editor.onDidBlurEditorText(() => this.shown?.script.typed.send());
  }

  static async create(host: HTMLElement, options: ScriptsEditorOptions): Promise<ScriptsEditor> {
    await startMonaco(host, options.theme);
    await setEditorTheme(options.theme);
    const editor = monaco.editor.create(host, {
      automaticLayout: true,
      fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
      fontSize: 13,
      fontLigatures: true,
      model: null,
      readOnly: options.readOnly,
    });
    return new ScriptsEditor(editor, options.onsend);
  }

  /** Colours the editor in a code theme. */
  setTheme(theme: CodeTheme): Promise<void> {
    return setEditorTheme(theme);
  }

  /** Shows a script, opening its document the first time, with the caret in it. */
  async show(id: number, text: string, language: keyof typeof files): Promise<void> {
    if (this.shown) this.shown.script.state = this.editor.saveViewState();
    let opening = this.open.get(id);
    if (!opening) {
      opening = this.opened(id, text, language);
      this.open.set(id, opening);
    }

    const script = await opening;
    this.shown = { id, script };
    this.editor.setModel(script.model);
    if (script.state) this.editor.restoreViewState(script.state);
    this.editor.focus();
  }

  private async opened(id: number, text: string, language: keyof typeof files): Promise<Open> {
    const uri = monaco.Uri.file(`/map/script-${id}.${files[language]}`);
    const reference = await createModelReference(uri, text);
    const model = reference.object.textEditorModel;
    if (!model) throw new Error(`No document for ${uri.path}`);
    const typed = typedText(
      () => model.getValue(),
      (value) => this.onsend(id, value),
    );
    model.onDidChangeContent(() => {
      if (!this.setting) typed.changed();
    });
    return { reference, model, typed, state: null };
  }

  /** Puts the map's text in a script, after an edit elsewhere or an undo; the box's own undo can step over it. */
  async setText(id: number, text: string): Promise<void> {
    const script = await this.open.get(id);
    if (!script || script.model.getValue() === text) return;
    this.setting = true;
    script.model.pushEditOperations(
      [],
      [{ range: script.model.getFullModelRange(), text }],
      () => null,
    );
    this.setting = false;
  }

  /** Closes a script, sending what was typed. */
  async close(id: number): Promise<void> {
    const script = await this.open.get(id);
    if (!script) return;
    script.typed.send();
    if (this.shown?.id === id) {
      this.shown = null;
      this.editor.setModel(null);
    }
    this.open.delete(id);
    // The text is the map's: nothing of it is to be saved to the file, which would keep the document alive.
    await script.reference.object.revert({ soft: true });
    script.reference.dispose();
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.open.keys()].map((id) => this.close(id)));
    this.editor.dispose();
  }
}
