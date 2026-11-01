import type { Notice } from "../StatusBar.svelte";

export class Notices {
  current = $state.raw<Notice | null>(null);
  #timer: ReturnType<typeof setTimeout> | undefined;

  say = (text: string, options: Omit<Notice, "text"> = {}): void => {
    clearTimeout(this.#timer);
    this.current = { text, ...options };
    const seconds = options.warn || options.caution ? 10 : 6;
    this.#timer = setTimeout(() => (this.current = null), seconds * 1000);
  };
}
