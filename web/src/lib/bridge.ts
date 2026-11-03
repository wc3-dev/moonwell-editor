/**
 * The page's side of the bridge to the C# app. Requests are `{id, command, args}` strings posted to WebView2;
 * replies are `{id, ok, result | error}` and events are `{event, payload}`, both coming back as strings.
 */

import type { Commands, ErrorCode, Events, NoArgs, Tells } from "./bridge.gen.ts";
import { t } from "./text.ts";

type Webview = NonNullable<NonNullable<Window["chrome"]>["webview"]>;
type Reply = {
  id: number | null;
  ok: boolean;
  result?: unknown;
  error?: { code: ErrorCode; message: string };
};

/**
 * What `call` takes after a command's name: nothing for a command with no arguments, its arguments (which may be left
 * out when every one has a default) for the others.
 */
type ArgsOf<C extends keyof Commands> = Commands[C]["args"] extends NoArgs
  ? []
  : NoArgs extends Commands[C]["args"]
    ? [args?: Commands[C]["args"]]
    : [args: Commands[C]["args"]];
type Pending = { resolve: (value: never) => void; reject: (error: Error) => void };

/** A command that failed in the app. `code` is the app's error code, such as `gameDataLoading`. */
export class BridgeError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}

let nextId = 1;
const pending = new Map<number, Pending>();
const handlers = new Map<string, Set<(payload: unknown) => void>>();
const listening = new WeakSet<Webview>();
// How many commands are waiting for their answer, and who wants to know (the status bar's loading mark).
let waiting = 0;
const watchers = new Set<(waiting: number) => void>();

function count(change: number): void {
  waiting += change;
  for (const watcher of watchers) watcher(waiting);
}

function webview(): Webview {
  const found = window.chrome?.webview;
  if (!found) throw new Error(t("error.notInWindow"));
  if (!listening.has(found)) {
    listening.add(found);
    found.addEventListener("message", (event) => receive(event.data));
  }
  return found;
}

function receive(data: unknown): void {
  const message = typeof data === "string" ? JSON.parse(data) : data;
  if (message && typeof message === "object" && "event" in message) {
    for (const handler of handlers.get(String(message.event)) ?? []) {
      handler((message as { payload: unknown }).payload);
    }
    return;
  }
  const reply = message as Reply;
  if (reply.id === null || reply.id === undefined) {
    // The app could not read a request (a badRequest), so it cannot say which one: every waiting call fails.
    if (!reply.ok) {
      const error = errorOf(reply);
      for (const waiting of pending.values()) waiting.reject(error);
      pending.clear();
    }
    return;
  }
  const waiting = pending.get(reply.id);
  if (!waiting) return;
  pending.delete(reply.id);
  if (reply.ok) waiting.resolve(reply.result as never);
  else waiting.reject(errorOf(reply));
}

function errorOf(reply: Reply): BridgeError {
  return new BridgeError(
    reply.error?.code ?? "failed",
    reply.error?.message ?? t("error.appFailed"),
  );
}

/**
 * Runs a command in the app. Its name, its arguments and its answer are the app's own (`Commands`, generated from the C#
 * command table). Rejects with a BridgeError (the app's code and message) when the command fails, and with an Error
 * when the page is not inside the Moonwell Editor window.
 */
export async function call<C extends keyof Commands>(
  command: C,
  ...args: ArgsOf<C>
): Promise<Commands[C]["answer"]> {
  const channel = webview();
  const id = nextId++;
  count(1);
  return new Promise<Commands[C]["answer"]>((resolve, reject) => {
    pending.set(id, {
      resolve: (value: never) => {
        count(-1);
        resolve(value);
      },
      reject: (error: Error) => {
        count(-1);
        reject(error);
      },
    });
    channel.postMessage(JSON.stringify({ id, command, args: args[0] ?? {} }));
  });
}

/**
 * Sends a command that is not answered, for what comes too often to count as the app working (keys in a terminal). It
 * must not be able to fail: a failure has no id to go back to.
 */
export function tell<C extends keyof Tells>(command: C, args: Tells[C]): void {
  webview().postMessage(JSON.stringify({ command, args }));
}

/**
 * Tells `handler` how many commands are waiting for their answer, now and each time that changes (Sven, 2026-10-28:
 * the status bar shows when the app is working). Returns a function that stops telling it.
 */
export function onWaiting(handler: (waiting: number) => void): () => void {
  watchers.add(handler);
  handler(waiting);
  return () => {
    watchers.delete(handler);
  };
}

/** Listens to an event the app sends on its own. Returns a function that stops listening. */
export function on<E extends keyof Events>(
  event: E,
  handler: (payload: Events[E]) => void,
): () => void {
  webview();
  const set = handlers.get(event) ?? new Set();
  const take = (payload: unknown) => handler(payload as Events[E]);
  set.add(take);
  handlers.set(event, set);
  return () => {
    set.delete(take);
  };
}
