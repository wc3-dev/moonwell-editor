import { mount } from "svelte";
import "./app.css";
import "virtual:uno.css";
import App from "./App.svelte";
import { loadHotkeys } from "./lib/app/keymap.ts";
import { homeBoot, writeSchemas } from "./lib/home/home.ts";
import { moveIfNeeded } from "./lib/home/move.ts";
import { loadState } from "./lib/home/state.svelte.ts";
import { loadSettings } from "./lib/prefs.svelte.ts";
import { loadUserThemes } from "./lib/themes.ts";

const boot = moveIfNeeded(homeBoot(), localStorage);
loadSettings(boot.settings, boot.unreadable.includes("settings.json"));
loadHotkeys(boot.hotkeys, boot.unreadable.includes("hotkeys.json"));
loadState(boot.state);
loadUserThemes(boot.themes, boot.unreadable);
writeSchemas();

mount(App, { target: document.getElementById("app") as HTMLElement });
