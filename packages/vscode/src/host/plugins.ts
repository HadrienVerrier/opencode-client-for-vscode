import { compose, type Entry } from "@opencode/plugin/gui/host"
import { builtins as upstream } from "../../../gui-plugins/src/renderer"
import setup, { definition } from "./vscode-plugin"

/**
 * The GUI's built-ins, plus the plugin that hands file links to VS Code and shows its open files above
 * the composer. Aliased over `@opencode/gui-plugins/renderer` in `vite.config.ts`, so the app's own
 * list is untouched.
 */
export const builtins: Entry[] = [
  ...upstream,
  ...compose({ vscode: { ...definition, windowEntry: () => Promise.resolve({ default: setup }) } }),
]
