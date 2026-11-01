/**
 * One terminal on the page, in xterm.js, the terminal VS Code draws with. The page loads this file when a terminal
 * first opens, so a session that never opens one does not pay for it.
 */
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import type { TerminalColors } from "../themeColors.ts";

export type XtermView = {
  write(text: string): void;
  /** Fits the terminal to its element; its size, or null while the element shows nothing. */
  fit(): { columns: number; rows: number } | null;
  focus(): void;
  setColors(colors: TerminalColors): void;
  dispose(): void;
};

type Options = { colors: TerminalColors; ontype: (text: string) => void };

export function openTerminal(element: HTMLElement, { colors, ontype }: Options): XtermView {
  const terminal = new Terminal({
    theme: colors,
    fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
    fontSize: 12,
    cursorBlink: true,
    scrollback: 5000,
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(element);
  terminal.onData(ontype);

  // Ctrl C copies a selection and otherwise stops what runs, as in VS Code; Ctrl V pastes, where a shell has no key for it.
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown" || !event.ctrlKey || event.altKey) return true;
    const key = event.key.toLowerCase();
    if (key === "c" && terminal.hasSelection()) {
      navigator.clipboard.writeText(terminal.getSelection()).catch(() => {});
      terminal.clearSelection();
      return false;
    }
    if (key === "v") {
      event.preventDefault();
      navigator.clipboard
        .readText()
        .then((text) => terminal.paste(text))
        .catch(() => {});
      return false;
    }
    return true;
  });

  const fit = (): { columns: number; rows: number } | null => {
    if (element.clientWidth === 0 || element.clientHeight === 0) return null;
    const size = fitAddon.proposeDimensions();
    if (!size || !Number.isFinite(size.cols) || !Number.isFinite(size.rows)) return null;
    terminal.resize(size.cols, size.rows);
    return { columns: size.cols, rows: size.rows };
  };

  // The font comes late the first time, and its width sets how many columns fit.
  document.fonts?.ready.then(fit);

  return {
    write: (text) => terminal.write(text),
    fit,
    focus: () => terminal.focus(),
    setColors: (next) => {
      terminal.options.theme = next;
    },
    dispose: () => terminal.dispose(),
  };
}
