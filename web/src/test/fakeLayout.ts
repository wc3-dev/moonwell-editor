/**
 * What jsdom does not do and a canvas needs: every element `width` by `height`, a ResizeObserver that reports once
 * an element is watched, the scale of a CSS transform, and media queries, none of which match.
 */
export function fakeLayout(width = 340, height = 100): void {
  fakeMediaQueries();
  globalThis.ResizeObserver = class {
    readonly #report: ResizeObserverCallback;

    constructor(report: ResizeObserverCallback) {
      this.#report = report;
    }

    observe(target: Element): void {
      const contentRect = { width: target.clientWidth, height: target.clientHeight };
      queueMicrotask(() => this.#report([{ target, contentRect } as ResizeObserverEntry], this));
    }

    unobserve(): void {}
    disconnect(): void {}
  };
  globalThis.DOMMatrixReadOnly = class {
    readonly m22: number;

    constructor(transform?: string) {
      this.m22 = Number(/scale\(([\d.]+)\)/.exec(transform ?? "")?.[1] ?? 1);
    }
  } as unknown as typeof DOMMatrixReadOnly;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: width });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: height,
  });
}

/** Media queries for jsdom, which has none: every one is false and never changes. */
export function fakeMediaQueries(): void {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
}
