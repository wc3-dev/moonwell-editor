// @vitest-environment jsdom
import { waitFor } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import { arena, FakeApp, gameReady, Refusal } from "../../test/fakeApp.ts";
import { CommandQueue } from "./commandQueue.ts";
import { History } from "./history.svelte.ts";
import { MapSession } from "./mapSession.svelte.ts";
import { Notices } from "./notices.svelte.ts";
import { Objects } from "./objects.svelte.ts";
import { Pages } from "./pages.svelte.ts";
import { Startup } from "./startup.svelte.ts";

let stop = () => {};

afterEach(() => {
  stop();
  delete window.chrome;
});

const missing = { source: null, loaded: false, error: null, version: 1 };

function started(): { startup: Startup; session: MapSession } {
  const queue = new CommandQueue();
  const objects = new Objects({ queue, history: new History(), scrollPosition: () => undefined });
  const session = new MapSession({
    queue,
    notices: new Notices(),
    objects,
    pages: new Pages(),
    terminals: { mapChanged() {} },
  });
  const startup = new Startup(session);
  stop = startup.start();
  return { startup, session };
}

test("the first answer sets where the game data stands", async () => {
  new FakeApp({ gameData: missing });
  const { startup } = started();
  await waitFor(() => expect(startup.view).toBe("missing"));
});

test("once it is ready the choice lists come and the started map opens, once", async () => {
  const app = new FakeApp({
    startup: { map: "C:/Maps/Arena" },
    openMap: arena,
    tree: [],
    choices: { team: { values: [] } },
  });
  const { startup, session } = started();
  await waitFor(() => expect(session.map).toEqual(arena));
  await app.emit("gameData", { ...gameReady, version: 2 });
  await app.idle();
  expect(app.count("openMap")).toBe(1);
  expect(app.count("choices")).toBe(1);
  expect(startup.choices).toEqual({ team: { values: [] } });
});

test("a choice list that fails shows where a map's problem would", async () => {
  new FakeApp({ choices: new Refusal("failed", "No lists") });
  const { session } = started();
  await waitFor(() => expect(session.problem).toBe("No lists"));
});

test("an older state does not undo a newer one", async () => {
  const app = new FakeApp({ gameData: { ...missing, version: 5 } });
  const { startup } = started();
  await app.idle();
  await app.emit("gameData", { ...gameReady, version: 2 });
  expect(startup.view).toBe("missing");
});

test("a map the app has open shows, with its session", async () => {
  new FakeApp({
    currentMap: { map: arena, session: { dirty: true, changedObjects: 4 } },
    tree: [],
  });
  const { session } = started();
  await waitFor(() => expect(session.map).toEqual(arena));
  expect(session.state).toEqual({ dirty: true, changedObjects: 4 });
});

test("the session follows the app", async () => {
  const app = new FakeApp();
  const { session } = started();
  await app.idle();
  await app.emit("sessionChanged", { dirty: true, changedObjects: 1 });
  expect(session.state).toEqual({ dirty: true, changedObjects: 1 });
});

test("a choice that fails says why, and one that works clears it", async () => {
  const app = new FakeApp({
    gameData: missing,
    chooseGameData: new Refusal("failed", "No such folder"),
  });
  const { startup } = started();
  await app.idle();
  await startup.choose();
  expect(startup.problem).toBe("No such folder");
  app.answers.chooseGameData = gameReady;
  await startup.choose();
  expect(startup.problem).toBe("");
  expect(startup.view).toBe("ready");
});

test("a failed start says why", async () => {
  new FakeApp({ ping: new Refusal("failed", "No answer") });
  const { startup } = started();
  await waitFor(() => expect(startup.connection).toBe("No answer"));
});
