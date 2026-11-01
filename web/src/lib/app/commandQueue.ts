/** The app's commands that change the map run one after another, so a save asked after an edit waits for it. */
export class CommandQueue {
  #last: Promise<unknown> = Promise.resolve();

  run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = this.#last.then(work);
    this.#last = next.catch(() => {});
    return next;
  };

  idle(): Promise<unknown> {
    return this.#last;
  }
}
