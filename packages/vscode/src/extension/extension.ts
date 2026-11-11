import { homedir } from "node:os"
import {
  ColorThemeKind,
  env,
  FileType,
  Position,
  Range,
  Selection,
  TabInputText,
  TextEditorRevealType,
  Uri,
  commands,
  window,
  workspace,
  StatusBarAlignment,
  type ExtensionContext,
  type WebviewView,
  type WebviewViewProvider,
} from "vscode"
import { startAssetServer, type AssetServer } from "./assets-server"
import { findOpenCode, installCommand, startLocalServer, type LocalServer } from "./local-server"
import { WebviewHost, PANEL_VIEW_TYPE } from "./panel"
import { checkServer, GUI_VERSION, normalizeServerUrl, parseServerUrl } from "./server-info"
import { nameProject } from "./project"
import { workspaceContext } from "../shared/workspace"
import type { ContextAttachment, HostConfig, HostMessage, HostTheme, SetupState } from "../shared/protocol"
import { openCandidates, suffixPattern } from "../shared/open-file"
import { selectionRange } from "../shared/selection"

const PASSWORD_KEY = "opencode.password"
const PORT_KEY = "opencode.port"
const VIEW_ID = "opencode.sidebar"
/** How long the selection settles before it is attached: a drag is one selection, not thirty. */
const SELECTION_DELAY_MS = 400

/** Passwords are per server: switching between two of them must not reuse the other one's secret. */
function passwordKey(url: string) {
  return `${PASSWORD_KEY}.${url}`
}

let assets: AssetServer | undefined
let host: WebviewHost | undefined
let selectionTimer: ReturnType<typeof setTimeout> | undefined
/** The selection last left in place, kept for the chat surfaces that do not exist yet. */
let lastSelection: ContextAttachment | undefined
/** The file the caret was last in: clicking the chat clears `window.activeTextEditor`. */
let activeFile: string | undefined
let status: import("vscode").StatusBarItem | undefined
/** Last message shown to the user, so a check on every window focus does not repeat it. */
let notice: string | undefined
/** Where the extension writes what it did, for a user reporting a broken window. */
let output: import("vscode").OutputChannel | undefined
/** The window's chats were renamed on this server already: a focus check must not ask again. */
let named = false
/** The server this window started for itself, when `opencode.serverUrl` is empty. */
let local: LocalServer | undefined
/** A spawn in progress: config, the setup form and a focus check all ask for the same server. */
let localAttempt: Promise<LocalServer | undefined> | undefined
/** The folder the local server was started in; a window that changes folders restarts it. */
let localFolder: string | undefined
/** Why no OpenCode 2 is running: no binary, an old one, or a spawn that failed. */
let localProblem: string | undefined
/** What to install when no OpenCode 2 binary is on the machine. */
let localInstall: SetupState["install"]
/** The terminal the installer runs in, so closing it retries the local server. */
let installTerminal: import("vscode").Terminal | undefined

function log(line: string) {
  output?.appendLine(line)
}

export async function activate(context: ExtensionContext) {
  output = window.createOutputChannel("OpenCode")
  context.subscriptions.push(output)
  await migratePassword(context)

  assets = await startAssetServer({
    root: context.asAbsolutePath("dist/host"),
    port: portFromState(context),
  }).catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause)
    log(`cannot serve the GUI: ${message}`)
    void window.showErrorMessage(`OpenCode: cannot serve the GUI: ${message}`)
    return undefined
  })

  if (assets) {
    await context.globalState.update(PORT_KEY, assets.port)
    log(`serving the GUI on ${assets.url}`)
  }

  const config = async (): Promise<HostConfig> => {
    const folders = (workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath.replaceAll("\\", "/"))
    const directory = (await workspaceChat())?.directory
    const server = await connect(context, directory)
    if (!server) return { theme: theme(), workspaceFolders: folders, workspaceDirectory: directory }

    return {
      // The extension is a `ui` extension: it and the webview run on this machine, so `asExternalUri`
      // would only wrap a reachable URL in a Remote-SSH tunnel pointing at the wrong host.
      serverUrl: server.url,
      password: server.password,
      theme: theme(),
      workspaceFolders: folders,
      workspaceDirectory: directory,
    }
  }

  const setup = async (): Promise<SetupState> => {
    const configured = workspace.getConfiguration("opencode").get<string>("serverUrl", "")
    // The form is the first place a user sees why nothing runs: start the check before showing it.
    if (!configured) await connect(context, (await workspaceChat())?.directory)
    return {
      serverUrl: configured,
      error: configured || localInstall ? undefined : localProblem,
      install: localInstall,
      localServer: local?.url,
      hasPassword: Boolean(
        configured && (await context.secrets.get(passwordKey(normalizeServerUrl(configured) ?? configured))),
      ),
    }
  }

  const save = async (input: { serverUrl: string; password?: string }) => {
    if (!input.serverUrl.trim()) {
      // An empty URL means the server this window starts itself: keep no remote settings in the way.
      await workspace.getConfiguration("opencode").update("serverUrl", "", true)
      await context.secrets.delete(PASSWORD_KEY)
      named = false
      stopLocal()
      return {}
    }

    const parsed = parseServerUrl(input.serverUrl)
    if (!parsed) return { error: "That is not a server URL. Try http://127.0.0.1:4096." }

    await saveServer(context, parsed, input.password)
    // An explicit server wins: the one this window started is no longer the one it talks to.
    stopLocal()
    named = false
    const result = await check(context)
    return result.error ? { error: result.error } : {}
  }

  activeFile = window.activeTextEditor?.document.uri.fsPath

  host = new WebviewHost({
    frame: async () => {
      if (!assets) throw new Error("asset server is not running")
      return assets.url
    },
    config,
    setup,
    save,
    message: (message) => receive(context, message),
    editors: () => editorFiles().paths,
    selection: () => lastSelection,
  })

  context.subscriptions.push(
    { dispose: () => void assets?.close() },
    window.registerWebviewViewProvider(VIEW_ID, provider(host), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    commands.registerCommand("opencode.open", () => host?.reveal()),
    commands.registerCommand("opencode.openInEditor", () => host?.openInEditor()),
    commands.registerCommand("opencode.configure", () => host?.configure()),
    commands.registerCommand("opencode.installOpenCode", () => installOpenCode()),
    commands.registerCommand("opencode.switchServer", () => switchServer(context)),
    commands.registerCommand("opencode.signOut", () => signOut(context)),
    commands.registerCommand("opencode.reload", () => host?.reload()),
    commands.registerCommand("opencode.checkServer", () => check(context)),
    commands.registerCommand("opencode.addSelection", () => addSelection()),
    commands.registerCommand("opencode.addFile", (uri?: Uri) => addFile(uri)),
    commands.registerCommand("opencode.addOpenEditors", () => addOpenEditors()),
    commands.registerCommand("opencode.newSession", () => host?.send({ type: "opencode/newSession" })),
    window.registerWebviewPanelSerializer(PANEL_VIEW_TYPE, {
      // The editor tab a user moved opencode to comes back with the window, instead of vanishing on reload.
      deserializeWebviewPanel: async (panel) => host?.adopt(panel),
    }),
    // A chat runs in the window's folders, so adding or removing one moves it: reload picks the new directory up.
    workspace.onDidChangeWorkspaceFolders(() => {
      named = false
      host?.reload()
      void check(context)
    }),
    // Closing the installer terminal is the user saying they are done: look for the binary again.
    window.onDidCloseTerminal((terminal) => {
      if (terminal !== installTerminal) return
      installTerminal = undefined
      localProblem = undefined
      localInstall = undefined
      stopLocal()
      host?.reload()
      void check(context)
    }),
    workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("opencode.serverUrl") && !event.affectsConfiguration("opencode.webviewPort"))
        return
      host?.reload()
      void check(context)
    }),
    window.onDidChangeActiveColorTheme(() => host?.broadcast({ type: "opencode/theme", theme: theme() })),
    window.tabGroups.onDidChangeTabs(() => pushEditors()),
    window.onDidChangeActiveTextEditor((editor) => {
      if (editor) activeFile = editor.document.uri.fsPath
      pushEditors()
    }),
    // Selecting code hands it to the chat, the way Copilot's implicit context follows the editor. A drag
    // fires an event per mouse move, so only the selection left in place is attached, and the chat is
    // never revealed: auto-attaching must not pull focus out of the editor.
    window.onDidChangeTextEditorSelection((event) => {
      activeFile = event.textEditor.document.uri.fsPath
      const selection = event.selections[0]
      // Remote-SSH documents are "vscode-remote", so only an untitled buffer is not a file on disk.
      if (!selection || event.textEditor.document.uri.scheme === "untitled") return clearSelection()
      const range = selectionRange(selection)
      if (!range) return clearSelection()

      clearTimeout(selectionTimer)
      selectionTimer = setTimeout(() => {
        lastSelection = { path: event.textEditor.document.uri.fsPath, ...range }
        host?.broadcast({ type: "opencode/context", attachments: [lastSelection], auto: true })
      }, SELECTION_DELAY_MS)
    }),
    // A restarted server comes back without any event: retry when the user returns to VS Code.
    window.onDidChangeWindowState((state) => {
      if (state.focused) void check(context)
    }),
    (status = window.createStatusBarItem(StatusBarAlignment.Right, 100)),
  )

  status.name = "OpenCode"
  status.command = "opencode.switchServer"
  status.text = "$(comment-discussion) OpenCode"
  status.tooltip = "OpenCode: click to switch server"
  status.show()

  void check(context).then((result) => {
    const configured = parseServerUrl(workspace.getConfiguration("opencode").get<string>("serverUrl", ""))
    // First run with nothing to connect to opens the form; a local server needs no setup of its own.
    if (!configured && result.error) void host?.reveal()
    else if (workspace.getConfiguration("opencode").get<boolean>("openOnStartup", false)) void host?.reveal()
  })
}

export function deactivate() {
  stopLocal()
  void assets?.close()
  status?.dispose()
}

/**
 * The server this window talks to: the URL in settings, else one it starts for itself.
 * Starting takes a few seconds, so every caller awaits the same attempt.
 */
async function connect(context: ExtensionContext, directory: string | undefined): Promise<ServerTarget | undefined> {
  const parsed = parseServerUrl(workspace.getConfiguration("opencode").get<string>("serverUrl", ""))
  if (parsed)
    return {
      url: parsed.url,
      username: parsed.username,
      password: parsed.password ?? (await context.secrets.get(passwordKey(parsed.url))),
    }

  const server = await ensureLocal(directory ?? homedir())
  return server && { url: server.url, password: server.password }
}

/** Starts OpenCode in this window's folder, once: a second ask joins the spawn already running. */
async function ensureLocal(directory: string) {
  if (local && localFolder === directory) return local
  if (localAttempt) return localAttempt
  // Nothing to start while the installer is still pending: a focus check must not probe every time.
  if (localInstall) return undefined
  stopLocal()
  localFolder = directory
  localAttempt = startLocal(directory).finally(() => (localAttempt = undefined))
  return localAttempt
}

async function startLocal(directory: string) {
  const found = await findOpenCode()
  if ("error" in found) {
    localProblem =
      found.error.reason === "outdated"
        ? `OpenCode ${found.error.version} is installed, but this extension needs OpenCode 2.`
        : "OpenCode 2 is not installed on this machine."
    localInstall = { command: installCommand(), reason: found.error.reason, version: found.error.version }
    log(localProblem)
    return undefined
  }

  localInstall = undefined
  const result = await startLocalServer({ binary: found.found.binary, directory })
  if (!result.server) {
    localProblem = result.error
    log(`cannot start OpenCode: ${result.error}`)
    return undefined
  }

  const server = result.server
  local = server
  localProblem = undefined
  log(`started OpenCode ${found.found.version} at ${server.url}`)
  void server.exited.then(() => {
    if (local !== server) return
    // No reload here: a binary that dies right after reporting ready must not restart in a loop.
    // The next focus check or reload starts it again.
    local = undefined
    localProblem = "OpenCode stopped."
  })
  return server
}

/** Ends the server this window started, leaving servers the settings point at alone. */
function stopLocal() {
  local?.stop()
  local = undefined
  localFolder = undefined
}

/** Runs the installer the OpenCode site gives in a terminal, where the user sees it and can answer it. */
function installOpenCode() {
  installTerminal = window.createTerminal({ name: "Install OpenCode" })
  installTerminal.show()
  installTerminal.sendText(installCommand())
}

function provider(target: WebviewHost): WebviewViewProvider {
  return { resolveWebviewView: (view: WebviewView) => target.resolve(view) }
}

function receive(context: ExtensionContext, message: HostMessage) {
  if (message.type === "opencode/credential") {
    void adoptCredential(context, message)
    return
  }

  if (message.type === "opencode/install") {
    installOpenCode()
    return
  }

  if (message.type === "opencode/retry") {
    localProblem = undefined
    localInstall = undefined
    stopLocal()
    host?.reload()
    return
  }

  if (message.type === "opencode/openFile") {
    void openFile(message)
    return
  }

  if (message.type === "opencode/openExternal") {
    void env.openExternal(Uri.parse(message.url))
    return
  }

  if (message.type === "opencode/pickFiles") {
    void pickFiles()
    return
  }

  if (message.type === "opencode/notify") {
    void window.showInformationMessage([message.title, message.description].filter(Boolean).join(" — "))
  }
}

/**
 * The GUI signed in to the configured server by itself, from a server list that outlives an extension
 * rename and its secrets. Keep the password it used, so the status bar checks the same server. A
 * password saved here wins: the GUI may still hold an older one.
 */
async function adoptCredential(context: ExtensionContext, message: { serverUrl: string; password: string }) {
  if (typeof message.serverUrl !== "string" || typeof message.password !== "string" || !message.password) return
  const configured = normalizeServerUrl(workspace.getConfiguration("opencode").get<string>("serverUrl", ""))
  if (!configured || normalizeServerUrl(message.serverUrl) !== configured) return
  if (await context.secrets.get(passwordKey(configured))) return
  await context.secrets.store(passwordKey(configured), message.password)
  void check(context)
}

/** Attaches the selected lines of the active editor, or the whole file when nothing is selected. */
async function addSelection() {
  const editor = window.activeTextEditor
  if (!editor) return warnNoFile()

  await host?.send({
    type: "opencode/context",
    attachments: [{ path: editor.document.uri.fsPath, ...selectionRange(editor.selection) }],
  })
}

/** Attaches one file: the explorer right-click target, else the active editor's file. */
async function addFile(uri?: Uri) {
  const target = uri ?? window.activeTextEditor?.document.uri
  if (!target || target.scheme === "untitled") return warnNoFile()

  await host?.send({ type: "opencode/context", attachments: [{ path: target.fsPath }] })
}

/** Attaches every file open in an editor tab, once each. */
async function addOpenEditors() {
  const paths = editorFiles().paths

  if (!paths.length) {
    void window.showWarningMessage("OpenCode: no open editor to attach.")
    return
  }

  await host?.send({ type: "opencode/context", attachments: paths.map((path) => ({ path })) })
}

/** The files open in editor tabs, once each, and the one in front: what the chat offers to attach. */
function editorFiles() {
  return {
    paths: [
      ...new Set(
        window.tabGroups.all.flatMap((group) =>
          group.tabs.flatMap((tab) => (tab.input instanceof TabInputText ? [tab.input.uri.fsPath] : [])),
        ),
      ),
    ],
    active: activeFile,
  }
}

/** Hands the editor's open files to every chat surface, without opening one. */
function pushEditors() {
  const files = editorFiles()
  host?.broadcast({ type: "opencode/editors", paths: files.paths, active: files.active })
}

/**
 * The editor's selection is a card in the prompt only while it lasts: collapsing it takes the card back out, so a range
 * the user moved away from never reaches the model.
 */
function clearSelection() {
  clearTimeout(selectionTimer)
  if (!lastSelection) return

  lastSelection = undefined
  host?.broadcast({ type: "opencode/context", attachments: [], auto: true })
}

/** Attaches what the user picks in the editor's file dialog: the whole workspace and disk are reachable. */
async function pickFiles() {
  const picked = await window.showOpenDialog({
    canSelectMany: true,
    openLabel: "Attach",
    title: "Attach files to the chat",
  })
  if (!picked?.length) return

  host?.broadcast({ type: "opencode/context", attachments: picked.map((uri) => ({ path: uri.fsPath })) })
}

function warnNoFile() {
  void window.showWarningMessage("OpenCode: open a file first.")
}

/** Opens a file the chat links to, at its line range. The server may run elsewhere, so the path is mapped first. */
async function openFile(input: { root: string; path: string; selection?: { start: number; end: number } }) {
  const folders = workspace.workspaceFolders ?? []

  if (!folders.length) {
    void window.showWarningMessage(`OpenCode: open a folder in VS Code to open ${input.path}.`)
    return
  }

  const uris = openCandidates(
    input,
    folders.map((folder) => folder.uri.fsPath),
  ).flatMap((candidate) => {
    if ("absolute" in candidate) return [Uri.file(candidate.absolute)]
    const folder = folders[candidate.folder]
    return folder ? [Uri.joinPath(folder.uri, candidate.relative)] : []
  })
  const uri = (await firstFile(uris)) ?? (await searchFile(input))

  if (!uri) {
    void window.showWarningMessage(`OpenCode: ${input.path} is not in this window.`)
    return
  }

  const document = await workspace.openTextDocument(uri).then(
    (document) => document,
    (cause: unknown) => {
      void window.showWarningMessage(
        `OpenCode: cannot open ${input.path}: ${cause instanceof Error ? cause.message : cause}`,
      )
      return undefined
    },
  )
  if (!document) return

  const editor = await window.showTextDocument(document, { preview: true })
  if (!input.selection) return

  const start = new Position(input.selection.start - 1, 0)
  const end = new Position(input.selection.end - 1, 0)
  editor.selection = new Selection(start, new Position(end.line, Number.MAX_SAFE_INTEGER))
  editor.revealRange(new Range(start, end), TextEditorRevealType.InCenterIfOutsideViewport)
}

async function firstFile(uris: readonly Uri[]) {
  for (const uri of uris) {
    const kind = await workspace.fs.stat(uri).then(
      (stat) => stat.type,
      () => undefined,
    )
    if (kind === FileType.File) return uri
  }
  return undefined
}

/** Last chance: the editor's own index, which answers "a file whose path ends with this". */
async function searchFile(input: { root: string; path: string }) {
  const pattern = suffixPattern(input)
  if (!pattern) return undefined
  const [uri] = await workspace.findFiles(pattern, undefined, 1)
  return uri
}

function theme(): HostTheme {
  const kind = window.activeColorTheme.kind
  return kind === ColorThemeKind.Light || kind === ColorThemeKind.HighContrastLight ? "light" : "dark"
}

/**
 * Where this window's chats run, and what the project there is called: the folder, the common ancestor of several
 * folders, or the active file's folder. Async only because a `.code-workspace` is read for the name it declares.
 */
async function workspaceChat() {
  const file = workspace.workspaceFile
  const saved = file?.scheme === "file"

  return workspaceContext({
    folders: (workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    // An untitled workspace has no file to read: VS Code's own name is all it has.
    file: saved ? { path: file.fsPath, content: await readText(file) } : undefined,
    title: workspace.name,
    activeFile: window.activeTextEditor?.document.uri.fsPath,
  })
}

function readText(uri: Uri) {
  return workspace.fs.readFile(uri).then(
    (bytes) => new TextDecoder().decode(bytes),
    () => undefined,
  )
}

function portFromState(context: ExtensionContext) {
  return (
    workspace.getConfiguration("opencode").get<number>("webviewPort", 0) || context.globalState.get<number>(PORT_KEY, 0)
  )
}

/** Saves a parsed server, keeping credentials tied to the origin that issued them. */
async function saveServer(
  context: ExtensionContext,
  parsed: NonNullable<ReturnType<typeof parseServerUrl>>,
  password?: string,
) {
  // A blank field keeps whatever this server already had: sign-out is the way to forget it.
  const secret = password || parsed.password
  if (secret) await context.secrets.store(passwordKey(parsed.url), secret)
  await workspace.getConfiguration("opencode").update("serverUrl", parsed.url, true)
}

/** Moves the one-password secret from before server switching under the server it was entered for. */
async function migratePassword(context: ExtensionContext) {
  const legacy = await context.secrets.get(PASSWORD_KEY)
  if (!legacy) return

  const configured = normalizeServerUrl(workspace.getConfiguration("opencode").get<string>("serverUrl", ""))
  if (configured) await context.secrets.store(passwordKey(configured), legacy)
  await context.secrets.delete(PASSWORD_KEY)
}

/** Picks the server this window talks to: the one on this machine, or a remote one. */
async function switchServer(context: ExtensionContext) {
  const configured = normalizeServerUrl(workspace.getConfiguration("opencode").get<string>("serverUrl", ""))
  const saved = configured && (await context.secrets.get(passwordKey(configured)))
  const items: Array<import("vscode").QuickPickItem & { action: "local" | "remote" | "add" | "signOut" }> = [
    {
      label: "$(device-desktop) This machine",
      description: local?.url ?? (localInstall ? "OpenCode 2 is not installed" : "starts OpenCode here"),
      action: "local",
    },
    ...(configured
      ? [
          {
            label: `$(globe) ${configured}`,
            description: saved ? "remote server, password saved" : "remote server",
            action: "remote" as const,
          },
        ]
      : []),
    { label: "$(add) Add a server…", action: "add" },
    ...(configured ? [{ label: `$(sign-out) Sign out of ${configured}`, action: "signOut" as const }] : []),
  ]

  const choice = await window.showQuickPick(items, {
    title: "OpenCode: server",
    placeHolder: configured ? `Connected to ${configured}` : "OpenCode runs on this machine",
  })
  if (!choice) return

  if (choice.action === "add") return host?.configure()
  if (choice.action === "signOut") return signOut(context)
  if (choice.action === "remote") return host?.reload()
  if (configured) await workspace.getConfiguration("opencode").update("serverUrl", "", true)
  // Asking for the local server is also a retry: the binary may have been installed since the last attempt.
  localProblem = undefined
  localInstall = undefined
  stopLocal()
  host?.reload()
  void check(context)
}

/** Forgets the configured server's password, leaving the URL in place so the form can sign in again. */
async function signOut(context: ExtensionContext) {
  const configured = normalizeServerUrl(workspace.getConfiguration("opencode").get<string>("serverUrl", ""))
  if (!configured) {
    void window.showInformationMessage("OpenCode: this window uses the server on this machine; nothing to sign out of.")
    return
  }

  await context.secrets.delete(passwordKey(configured))
  await context.secrets.delete(PASSWORD_KEY)
  notice = undefined
  host?.reload()
  void window.showInformationMessage(`OpenCode: signed out of ${configured}.`)
  await check(context)
}

/** What this window talks to: the server it started, or the one the settings point at. */
type ServerTarget = { url: string; username?: string; password?: string }

async function check(context: ExtensionContext): Promise<{ error?: string }> {
  const server = await connect(context, (await workspaceChat())?.directory)
  if (!server) {
    if (status)
      status.text = localInstall ? "$(warning) OpenCode: install" : "$(comment-discussion) OpenCode: no server"
    if (localInstall && localProblem && notice !== "install") {
      notice = "install"
      void window.showWarningMessage(localProblem, "Install", "Configure server").then((choice) => {
        if (choice === "Install") installOpenCode()
        if (choice === "Configure server") void host?.configure()
      })
    }
    return { error: localProblem ?? "No server URL is configured." }
  }

  const result = await checkServer(server)

  if (!result.ok) {
    log(`server ${server.url}: ${result.status ? `HTTP ${result.status}` : result.error}`)
    if (result.status === 401 || result.status === 403) {
      if (status) {
        status.text = "$(lock) OpenCode: sign-in"
        status.command = "opencode.configure"
      }
      // No password stored yet: the GUI may sign in on its own and report it, so stay quiet.
      if (server.password && notice !== "sign-in") {
        notice = "sign-in"
        void window.showWarningMessage(`OpenCode: ${server.url} rejected the password.`, "Configure").then((choice) => {
          if (choice === "Configure") void host?.configure()
        })
      }
      return { error: "The server rejected the password." }
    }

    if (status) status.text = "$(debug-disconnect) OpenCode: offline"
    if (notice !== "offline") {
      notice = "offline"
      void window
        .showWarningMessage(`OpenCode: cannot reach ${server.url} (${result.error}).`, "Configure")
        .then((choice) => {
          if (choice === "Configure") void host?.configure()
        })
    }
    return { error: `Cannot reach ${server.url} (${result.error}).` }
  }

  if (status) {
    status.text = `$(comment-discussion) OpenCode ${result.version}`
    status.command = "opencode.switchServer"
    status.tooltip = `OpenCode ${result.version} at ${server.url}\nGUI built for ${GUI_VERSION}\npassword: ${
      server.password ? "saved" : "none"
    }`
  }

  if (!result.compatible && notice !== "version") {
    notice = "version"
    void window.showWarningMessage(
      `OpenCode: GUI built for ${GUI_VERSION}, server is ${result.version}. Rebuild packages/vscode when you upgrade the server.`,
    )
  }

  if (result.compatible) notice = undefined

  // A window whose chats run in the ancestor of several folders gets a project named after the workspace: once per
  // server, not on every focus check. A check that failed names it again on the next focus.
  if (!named) {
    named = true
    void nameWorkspaceProject(context, server).then((failed) => {
      if (failed) named = false
    })
  }

  return {}
}

/** Names the project of the window's directory after its workspace; returns why the server said no, if it did. */
async function nameWorkspaceProject(context: ExtensionContext, server: ServerTarget) {
  // A single folder keeps the project the server resolved for it, which may be a repository above the folder.
  if ((workspace.workspaceFolders ?? []).length < 2) return undefined

  const chat = await workspaceChat()
  if (!chat) return undefined

  const result = await nameProject({ ...server, ...chat })

  log(`project of ${chat.directory}: ${result.error ?? chat.name}`)

  return result.error
}
