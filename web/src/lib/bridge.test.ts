import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeError, call, on, onWaiting, tell } from "./bridge.ts";
import { t } from "./text.ts";

type Listener = (event: { data: string }) => void;

/** A stand-in for window.chrome.webview: it records what the page posts and lets a test reply. */
function fakeWebview() {
  const listeners = new Set<Listener>();
  const sent: { id?: number; command: string; args: unknown }[] = [];
  return {
    sent,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    postMessage: (message: string) => sent.push(JSON.parse(message)),
    reply: (message: object) => {
      for (const listener of listeners) listener({ data: JSON.stringify(message) });
    },
  };
}

let webview: ReturnType<typeof fakeWebview>;

// Answers every request sent so far, so no call is left waiting for the next test.
function answerAll(): void {
  for (const each of webview.sent) webview.reply({ id: each.id, ok: true, result: null });
}

beforeEach(() => {
  webview = fakeWebview();
  vi.stubGlobal("window", { chrome: { webview } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("call", () => {
  it("posts the command and its arguments and resolves with the answer", async () => {
    const pending = call("tree", { kind: "unit" });
    expect(webview.sent).toHaveLength(1);
    expect(webview.sent[0]).toMatchObject({ command: "tree", args: { kind: "unit" } });

    webview.reply({ id: webview.sent[0]?.id, ok: true, result: [] });

    await expect(pending).resolves.toEqual([]);
  });

  it("posts empty arguments for a command that takes none", async () => {
    const pending = call("undo");

    expect(webview.sent[0]).toMatchObject({ command: "undo", args: {} });
    answerAll();
    await pending;
  });

  it("rejects with the app's code and message when ok is false", async () => {
    const pending = call("save");
    webview.reply({
      id: webview.sent[0]?.id,
      ok: false,
      error: { code: "changedOnDisk", message: "it changed" },
    });

    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BridgeError);
    expect(error).toMatchObject({ code: "changedOnDisk", message: "it changed" });
  });

  it("matches replies by id when they arrive out of order", async () => {
    const first = call("nextId", { kind: "unit", baseId: "hfoo" });
    const second = call("nextId", { kind: "item", baseId: "afac" });
    const [a, b] = webview.sent;

    webview.reply({ id: b?.id, ok: true, result: "I000" });
    webview.reply({ id: a?.id, ok: true, result: "h000" });

    await expect(first).resolves.toBe("h000");
    await expect(second).resolves.toBe("I000");
  });

  it("rejects, rather than throws, outside the Moonwell Editor window", async () => {
    vi.stubGlobal("window", {});

    const pending = call("ping");

    await expect(pending).rejects.toThrow(t("error.notInWindow"));
  });

  it("rejects every waiting call when an error reply has no id", async () => {
    const first = call("undo");
    const second = call("redo");

    // The app could not read a request, so it cannot say which one it was.
    webview.reply({ id: null, ok: false, error: { code: "badRequest", message: "not JSON" } });

    await expect(first).rejects.toMatchObject({ code: "badRequest", message: "not JSON" });
    await expect(second).rejects.toMatchObject({ code: "badRequest", message: "not JSON" });

    // Later calls are not affected.
    const third = call("ping");
    webview.reply({ id: webview.sent[2]?.id, ok: true, result: "pong" });
    await expect(third).resolves.toBe("pong");
  });

  it("checks a command's name and arguments when the page is built", async () => {
    const pending = [
      // @ts-expect-error: the app has no such command
      call("nope"),
      // @ts-expect-error: there is no such kind
      call("tree", { kind: "nope" }),
      // @ts-expect-error: tree needs its kind
      call("tree"),
    ];

    expect(webview.sent.map((each) => each.command)).toEqual(["nope", "tree", "tree"]);
    answerAll();
    await Promise.all(pending);
  });
});

describe("tell", () => {
  it("posts a command with no id", () => {
    tell("terminalWrite", { id: 3, text: "dir\r" });

    expect(webview.sent[0]).toEqual({ command: "terminalWrite", args: { id: 3, text: "dir\r" } });
  });
});

describe("on", () => {
  it("receives the payload of its event and stops after unsubscribing", () => {
    const seen: unknown[] = [];
    const off = on("sessionChanged", (payload) => seen.push(payload.changedObjects));

    webview.reply({ event: "sessionChanged", payload: { dirty: true, changedObjects: 2 } });
    webview.reply({ event: "windowState", payload: { maximized: true } });
    off();
    webview.reply({ event: "sessionChanged", payload: { dirty: false, changedObjects: 0 } });

    expect(seen).toEqual([2]);
  });
});

describe("onWaiting", () => {
  it("counts the commands sent until each is answered, failed ones too", async () => {
    const counts: number[] = [];
    const stop = onWaiting((waiting) => counts.push(waiting));
    const first = call("ping");
    const second = call("ping");
    webview.reply({ id: webview.sent[0]?.id, ok: true, result: null });
    webview.reply({ id: webview.sent[1]?.id, ok: false, error: { code: "failed", message: "no" } });
    await first;
    await expect(second).rejects.toThrow("no");
    stop();
    expect(counts).toEqual([0, 1, 2, 1, 0]);
  });
});
