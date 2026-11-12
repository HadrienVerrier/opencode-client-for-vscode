import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { LinkHandler, Slot, Style, Plugin, type SessionScreen } from "@opencode/plugin/gui"
import { checkFileLinkExists, parseFileLink } from "../../../gui-plugins/src/file/resolve-link"
import { label, offeredFiles } from "./chips"
import { hostConfig, onChat, send } from "./bridge"
import { isEditorLink } from "../shared/open-file"
import { selectionDescription } from "../shared/selection"
import type { ContextAttachment } from "../shared/protocol"
import en from "./i18n/en"

/** Files shown as chips before the rest move behind one "more files" chip. */
const MAX_CHIPS = 3

/** Identity of the one card that mirrors the editor's selection, so the next selection replaces it. */
const SELECTION_ID = "vscode.selection"

export const definition = Plugin.define({ i18n: { en } })

/** Compiles into the GUI bundle: the extension and the plugin share one process, so `send` reaches it. */
const setup: Plugin.Setup<typeof definition> = (ctx) => {
  // A plain browser tab has no extension behind it, so the file panel keeps every link.
  if (window.parent === window) return

  // The GUI keeps its own server list, which survives an extension rename that empties its secrets:
  // hand the password it connects with to the extension, whose status bar checks the same server.
  const reported = new Map<string, string>()
  createEffect(() => {
    for (const id of ctx.servers.list()) {
      const server = ctx.servers.get(id)
      if (!server?.password || reported.get(server.url) === server.password) continue
      reported.set(server.url, server.password)
      send({ type: "opencode/credential", serverUrl: server.url, password: server.password })
    }
  })

  // Files open in the editor, pushed by the extension on every tab and editor switch.
  const [editors, setEditors] = createSignal<{ paths: readonly string[]; active?: string }>({ paths: [] })

  const attach = (screen: SessionScreen, attachment: ContextAttachment, commentID?: string) => {
    const path = screen.file.resolve(attachment.path)

    screen.composer.attach({
      type: "file",
      path,
      commentID,
      // The model reads the attached lines' content but not where they came from, so the description names both.
      description: selectionDescription({ ...attachment, path }),
      selection: attachment.startLine
        ? {
            startLine: attachment.startLine,
            endLine: attachment.endLine ?? attachment.startLine,
            startChar: 0,
            endChar: 0,
          }
        : undefined,
    })
  }

  const stop = onChat((request) => {
    if (request.type === "editors") {
      setEditors({ paths: request.paths, active: request.active })
      return
    }

    if (request.type === "newSession") {
      if (!ctx.commands.run("tab.new")) ctx.toast.show({ title: "OpenCode: cannot open a new chat." })
      return
    }

    // A draft has no session screen yet, and the SDK exposes its composer only through one.
    const screen = ctx.screen.current()
    if (!screen) {
      if (!request.auto) ctx.toast.show({ title: "OpenCode: open a chat to attach files." })
      return
    }

    // The editor's selection is one attachment at a time: a new selection replaces its card, and clearing the selection
    // removes it. Every selection change reports itself, so this stays cheap.
    if (request.auto) {
      screen.composer.detach(SELECTION_ID)

      for (const attachment of request.attachments) attach(screen, attachment, SELECTION_ID)
      return
    }

    for (const attachment of request.attachments) attach(screen, attachment)
  })
  onCleanup(stop)

  ctx.add(Style, CHIPS)

  ctx.add(Slot, {
    at: "composer.lane",
    render: (input) => {
      // A file already attached to this prompt is a card above it, so it stops being a suggestion.
      const offered = () =>
        offeredFiles({
          editors: editors(),
          attached: input.screen.composer.attached(),
          resolve: (path) => input.screen.file.resolve(path),
        })

      return (
        <Show when={offered().length > 0}>
          <div data-vscode-chips>
            <For each={offered().slice(0, MAX_CHIPS)}>
              {(path) => (
                <button
                  type="button"
                  data-vscode-chip
                  data-active={path === editors().active}
                  title={path}
                  onClick={() => attach(input.screen, { path })}
                >
                  <span aria-hidden="true">+</span>
                  <span dir="auto">{label(path, hostConfig.workspaceFolders ?? [])}</span>
                </button>
              )}
            </For>
            <Show when={offered().length > MAX_CHIPS}>
              <button
                type="button"
                data-vscode-chip
                title={ctx.t("chip.more.title")}
                onClick={() => send({ type: "opencode/pickFiles" })}
              >
                <span aria-hidden="true">+</span>
                <span dir="auto">{ctx.plural("chip.more", offered().length - MAX_CHIPS)}</span>
              </button>
            </Show>
          </div>
        </Show>
      )
    },
  })

  ctx.add(LinkHandler, {
    // Above the file plugin's catch-all (`match: () => true`).
    priority: 100,
    match: (link) => isEditorLink(link.href, hostConfig.workspaceFolders ?? []),
    exists: (link) => {
      const screen = ctx.screen.current()
      if (!screen) return false
      return checkFileLinkExists({ files: screen.file, href: link.href, signal: ctx.signal })
    },
    open(link) {
      const screen = ctx.screen.current()
      if (!screen) return
      const parsed = parseFileLink(link.href)
      send({
        type: "opencode/openFile",
        root: screen.file.root,
        path: screen.file.resolve(parsed.path),
        selection: parsed.selection,
      })
    },
  })
}

/** Muted until clicked: these are files the editor has open, not attachments yet. */
const CHIPS = `
[data-vscode-chips] {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  pointer-events: auto;
}
[data-vscode-chip] {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 220px;
  height: 26px;
  padding-inline: 8px;
  border: 0.5px dashed var(--v2-border-border-muted);
  border-radius: 6px;
  background: transparent;
  color: var(--v2-text-text-muted);
  font-size: 12px;
  line-height: 14px;
  white-space: nowrap;
  cursor: pointer;
}
[data-vscode-chip] > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-vscode-chip][data-active="true"] {
  color: var(--v2-text-text-base);
}
@media (hover: hover) {
  [data-vscode-chip]:hover {
    border-style: solid;
    color: var(--v2-text-text-base);
  }
}
`

export default setup
