/**
 * Work that runs one after another, in the order asked: a save asked after an edit waits for it, and a bulk change in
 * the table works from what the one before it left.
 */
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
