import { expect, test } from "vitest";
import { CommandQueue } from "./commandQueue.ts";

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("commands run one after another, in the order asked", async () => {
  const queue = new CommandQueue();
  const first = deferred();
  const order: string[] = [];
  const one = queue.run(async () => {
    order.push("first starts");
    await first.promise;
    order.push("first ends");
  });
  const two = queue.run(async () => {
    order.push("second");
  });
  await Promise.resolve();
  expect(order).toEqual(["first starts"]);
  first.resolve();
  await Promise.all([one, two]);
  expect(order).toEqual(["first starts", "first ends", "second"]);
});

test("a command gives its own answer", async () => {
  expect(await new CommandQueue().run(async () => 7)).toBe(7);
});

test("a command that fails fails for its caller only", async () => {
  const queue = new CommandQueue();
  const failed = queue.run(async () => {
    throw new Error("Refused");
  });
  const next = queue.run(async () => "next");
  await expect(failed).rejects.toThrow("Refused");
  await expect(next).resolves.toBe("next");
});

test("idle waits for what was asked so far", async () => {
  const queue = new CommandQueue();
  const first = deferred();
  let done = false;
  queue.run(() => first.promise);
  const waited = queue.idle().then(() => {
    done = true;
  });
  await Promise.resolve();
  expect(done).toBe(false);
  first.resolve();
  await waited;
  expect(done).toBe(true);
});
