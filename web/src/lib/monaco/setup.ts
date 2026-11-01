/**
 * Monaco in its extended mode, on VS Code's own services (Sven, 2026-11-01), started once, when the Script Editor first
 * opens a script. VS Code's extensions bring Lua and C#. JASS comes in as an extension of our own, with Drake53's grammar
 * (language-jass, MIT), and so do the code themes. A language server can join later, through monaco-languageclient.
 */
import "@codingame/monaco-vscode-csharp-default-extension";
import "@codingame/monaco-vscode-lua-default-extension";
import { updateUserConfiguration } from "@codingame/monaco-vscode-configuration-service-override";
import { MonacoVscodeApiWrapper } from "monaco-languageclient/vscodeApiWrapper";
import { configureDefaultWorkerFactory } from "monaco-languageclient/workerFactory";
import type { Theme } from "../themes.ts";
import { editorThemeId, editorThemes } from "./editorThemes.ts";
import jassConfiguration from "./jass.language-configuration.json?raw";
import jassGrammar from "./jass.tmLanguage.json?raw";

let started: Promise<void> | null = null;

function settings(theme: Theme): string {
  return JSON.stringify({
    "workbench.colorTheme": editorThemeId(theme),
    "editor.bracketPairColorization.enabled": false,
  });
}

function start(container: HTMLElement, theme: Theme): Promise<void> {
  const codeThemes = editorThemes();
  const wrapper = new MonacoVscodeApiWrapper({
    $type: "extended",
    viewsConfig: { $type: "EditorService", htmlContainer: container },
    userConfiguration: { json: settings(theme) },
    monacoWorkerFactory: configureDefaultWorkerFactory,
    extensions: [
      {
        config: {
          name: "moonwell-jass",
          publisher: "moonwell",
          version: "1.0.0",
          engines: { vscode: "*" },
          contributes: {
            languages: [
              {
                id: "jass",
                aliases: ["JASS"],
                extensions: [".j"],
                configuration: "./language-configuration.json",
              },
            ],
            grammars: [
              { language: "jass", scopeName: "source.jass", path: "./jass.tmLanguage.json" },
            ],
          },
        },
        filesOrContents: new Map([
          ["/language-configuration.json", jassConfiguration],
          ["/jass.tmLanguage.json", jassGrammar],
        ]),
      },
      {
        config: {
          name: "moonwell-code-themes",
          publisher: "moonwell",
          version: "1.0.0",
          engines: { vscode: "*" },
          contributes: { themes: codeThemes.contributes },
        },
        filesOrContents: codeThemes.files,
      },
    ],
  });
  return wrapper.start();
}

/** Starts Monaco, the first time it is asked. */
export function startMonaco(container: HTMLElement, theme: Theme): Promise<void> {
  started ??= start(container, theme);
  return started;
}

/** Colours Monaco in a code theme. */
export function setEditorTheme(theme: Theme): Promise<void> {
  return updateUserConfiguration(settings(theme));
}
