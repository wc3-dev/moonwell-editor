/**
 * A box whose text is sent when it changes, and also when a save, a reload or closing asks for what is typed (`typing`),
 * as a window that is not in front gets no blur. Used as a Svelte action: `use:typedBox={(value) => ...}`.
 */
import { typing } from "../typing.ts";

type Box = HTMLInputElement | HTMLTextAreaElement;

/** The same for a box of any make: `changed` when it is typed in, `send` when it should go, which it does once. */
export function typedText(
  read: () => string,
  send: (value: string) => void,
): { changed(): void; send(): void; update(next: (value: string) => void): void } {
  let current = send;
  let release: (() => void) | null = null;

  const flush = (): void => {
    if (!release) return;
    release();
    release = null;
    current(read());
  };
  return {
    changed() {
      release ??= typing(flush);
    },
    send: flush,
    update(next) {
      current = next;
    },
  };
}

export function typedBox(
  box: Box,
  send: (value: string) => void,
): { update(next: (value: string) => void): void; destroy(): void } {
  const text = typedText(() => box.value, send);

  box.addEventListener("input", text.changed);
  box.addEventListener("change", text.send);
  return {
    update: text.update,
    destroy() {
      box.removeEventListener("input", text.changed);
      box.removeEventListener("change", text.send);
      text.send();
    },
  };
}
