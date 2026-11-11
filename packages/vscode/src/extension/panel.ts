import { ViewColumn, commands, window, type Webview, type WebviewPanel, type WebviewView } from "vscode"
import type { ContextAttachment, HostConfig, HostMessage, PageMessage, SetupState } from "../shared/protocol"
import { webviewHtml } from "../shared/webview-html"

/** The editor-tab panel's view type. The extension registers a serializer for it, so the tab returns with the window. */
export const PANEL_VIEW_TYPE = "opencode"

export class WebviewHost {
  private view: WebviewView | undefined
  private panel: WebviewPanel | undefined
  private readonly wired = new WeakSet<Webview>()
  private wantsSetup = false

  constructor(
    private readonly input: {
      /** URL the iframe loads: the local asset server, same machine as the webview. */
      frame: () => Promise<string>
      config: () => Promise<HostConfig>
      setup: () => Promise<SetupState>
      /** Saves the server form; `error` keeps the form open with the reason. */
      save: (input: { serverUrl: string; password?: string }) => Promise<{ error?: string }>
      message: (message: HostMessage) => void
      /** Files open in editor tabs, so the chat offers them for a one-click attach. */
      editors: () => readonly string[]
      /** The editor selection left in place, for a chat the user had not opened yet. */
      selection: () => ContextAttachment | undefined
    },
  ) {}

  resolve(view: WebviewView) {
    // Without scripts the relay page cannot answer the GUI's ready handshake, and the frame stays blank.
    view.webview.options = { enableScripts: true }
    this.view = view
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined
    })
    void this.attach(view.webview)
  }

  reveal() {
    return commands.executeCommand("opencode.sidebar.focus")
  }

  async openInEditor() {
    if (this.panel) return this.panel.reveal()

    const panel = window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      "OpenCode",
      { viewColumn: ViewColumn.Active, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    )

    await this.adopt(panel)
  }

  /** Takes over a panel VS Code restored, so the tab a user moved opencode to comes back with the window. */
  async adopt(panel: WebviewPanel) {
    this.panel = panel
    panel.onDidDispose(() => {
      if (this.panel === panel) this.panel = undefined
    })
    await this.attach(panel.webview)
  }

  reload() {
    if (this.view) void this.attach(this.view.webview)
    if (this.panel) void this.attach(this.panel.webview)
  }

  /** Opens the server form, including when the view was not created yet. */
  async configure() {
    this.wantsSetup = true
    await this.reveal()
    await this.flushSetup()
  }

  /** Sends a chat request to the GUI, creating the view first when the user never opened it. */
  async send(message: PageMessage) {
    this.pending.push(message)
    await this.reveal()
    await this.flush()
  }

  broadcast(message: PageMessage) {
    void this.view?.webview.postMessage(message)
    void this.panel?.webview.postMessage(message)
  }

  private pending: PageMessage[] = []

  /** Chat requests go to the sidebar, the one surface `reveal` opens; two GUIs must not both attach. */
  private async flush() {
    if (!this.view) return
    for (const message of this.pending.splice(0)) await this.view.webview.postMessage(message)
  }

  private async flushSetup() {
    if (!this.wantsSetup) return
    this.wantsSetup = false
    this.broadcast({ type: "opencode/setup", ...(await this.input.setup()) })
  }

  private async attach(webview: Webview) {
    if (!this.wired.has(webview)) {
      this.wired.add(webview)
      webview.onDidReceiveMessage((message: HostMessage) => void this.receive(webview, message))
    }

    try {
      // The sidebar paints its own background behind the frame; an editor tab paints the editor's.
      webview.html = webviewHtml(await this.input.frame(), webview === this.view?.webview ? "sidebar" : "panel")
    } catch (cause) {
      webview.html = errorHtml(cause instanceof Error ? cause.message : String(cause))
      return
    }

    await this.flushSetup()
    if (webview === this.view?.webview) await this.flush()
  }

  private async receive(webview: Webview, message: HostMessage) {
    if (message.type === "opencode/ready") {
      const config = await this.input.config()
      // Even with no server the GUI renders its own empty state, so "Hide" on the form is not a blank page.
      await webview.postMessage({ type: "opencode/config", config })
      await webview.postMessage({ type: "opencode/editors", paths: this.input.editors() })
      // A selection made before any chat surface existed lands with the first one that boots.
      const selection = this.input.selection()
      if (selection) await webview.postMessage({ type: "opencode/context", attachments: [selection], auto: true })
      if (!config.serverUrl) {
        this.wantsSetup = false
        await webview.postMessage({ type: "opencode/setup", ...(await this.input.setup()) })
      }
      return
    }

    if (message.type === "opencode/saveServer") {
      const result = await this.input.save(message)
      if (result.error) {
        await webview.postMessage({
          type: "opencode/setup",
          serverUrl: message.serverUrl,
          hasPassword: false,
          error: result.error,
        })
        return
      }
      this.reload()
      return
    }

    this.input.message(message)
  }
}

function errorHtml(message: string) {
  return `<!doctype html><html><body style="font-family: sans-serif; padding: 16px; color: #ccc; background: #1e1e1e">
<p>OpenCode GUI is not built.</p>
<pre>${escape(message)}</pre>
<p>Run <code>bun run build:host</code> in <code>packages/vscode</code>.</p>
</body></html>`
}

function escape(value: string) {
  return value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] ?? char)
}
