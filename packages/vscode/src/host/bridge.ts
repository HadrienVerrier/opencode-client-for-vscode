import type { ContextAttachment, HostConfig, HostMessage } from "../shared/protocol"

/**
 * Host side of the extension bridge. This module is the only place that talks to the webview
 * container page; everything else imports `config` and `send`.
 */

let resolveConfig: (config: HostConfig) => void = () => {}
let delivered = false
/** Resolves once the extension answers the ready handshake; stays pending when the GUI runs in a browser. */
export const config = new Promise<HostConfig>((resolve) => {
  resolveConfig = resolve
})

/** The last config the extension sent, for code that runs after the handshake and cannot await it. */
export const hostConfig: HostConfig = {}

export function send(message: HostMessage) {
  window.parent.postMessage(message, "*")
}

/** What the extension asks the chat to do: attach editor files, offer open ones, or open a new chat. */
export type ChatRequest =
  | { type: "attach"; attachments: ContextAttachment[]; auto?: boolean }
  | { type: "editors"; paths: string[]; active?: string }
  | { type: "newSession" }

const chats = new Set<(request: ChatRequest) => void>()

/** Subscribes to the extension's chat commands; returns the unsubscribe. */
export function onChat(handler: (request: ChatRequest) => void) {
  chats.add(handler)
  return () => {
    chats.delete(handler)
  }
}

// The GUI reads the system scheme through matchMedia, which inside a webview reports the OS, not
// VS Code. An explicit GUI choice wins; `system` (or no choice) follows the editor instead.
const followsEditorTheme = (() => {
  try {
    const chosen = localStorage.getItem("opencode-color-scheme")
    return !chosen || chosen === "system"
  } catch {
    return false
  }
})()

let media: MediaQueryList | undefined
let current: "light" | "dark" = "light"

export function applyTheme(theme: "light" | "dark") {
  if (!followsEditorTheme) return
  current = theme
  document.documentElement.dataset.colorScheme = theme
  if (!media) {
    const native = window.matchMedia.bind(window)
    const list = native("(prefers-color-scheme: dark)")
    media = list
    Object.defineProperty(list, "matches", { get: () => current === "dark" })
    window.matchMedia = (query) => (query === "(prefers-color-scheme: dark)" ? list : native(query))
    return
  }
  // The GUI's theme machine listens for `change` and recomputes from `matches`.
  media.dispatchEvent(new Event("change"))
}

window.addEventListener("message", (event) => {
  const data = event.data as
    | {
        type?: string
        config?: HostConfig
        theme?: "light" | "dark"
        attachments?: ContextAttachment[]
        auto?: boolean
        paths?: string[]
        active?: string
      }
    | undefined

  if (data?.type === "opencode/config" && !delivered) {
    delivered = true
    Object.assign(hostConfig, data.config)
    resolveConfig(data.config ?? {})
  }

  if (data?.type === "opencode/theme" && data.theme) applyTheme(data.theme)

  if (data?.type === "opencode/context" && data.attachments)
    for (const handler of chats) handler({ type: "attach", attachments: data.attachments, auto: data.auto })

  if (data?.type === "opencode/editors" && data.paths)
    for (const handler of chats) handler({ type: "editors", paths: data.paths, active: data.active })

  if (data?.type === "opencode/newSession") for (const handler of chats) handler({ type: "newSession" })
})

send({ type: "opencode/ready" })

// Standalone (browser) run: no extension answers the handshake, so checks can point at any server.
if (window.parent === window)
  resolveConfig({
    serverUrl: new URLSearchParams(location.search).get("server") ?? "http://127.0.0.1:4096",
    password: new URLSearchParams(location.search).get("password") ?? undefined,
  })
