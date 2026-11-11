/** What the extension hands the GUI. */
export type HostConfig = {
  serverUrl?: string
  password?: string
  /** VS Code colour theme, so a GUI set to `system` matches the editor rather than the OS. */
  theme?: HostTheme
  /** The editor's workspace folders, so a file link opens only when the editor can find the file. */
  workspaceFolders?: string[]
  /**
   * Where a chat runs: the folder, the common ancestor of several folders, or the active file's folder. Absent when
   * the window knows nothing better than the server's own location, which then stays the GUI's default.
   */
  workspaceDirectory?: string
}

export type HostTheme = "light" | "dark"

/** What the setup form shows: current server, whether a password is stored, and why it failed. */
export type SetupState = {
  serverUrl: string
  hasPassword: boolean
  error?: string
  /** Set when no OpenCode 2 binary is available: the command to install it, and why it is needed. */
  install?: { command: string; reason: "missing" | "outdated"; version?: string }
  /** The server this window started itself, when it is the one in use. */
  localServer?: string
}

/** Messages the page or the GUI sends to the extension. */
export type HostMessage =
  | { type: "opencode/ready" }
  | { type: "opencode/openExternal"; url: string }
  | { type: "opencode/notify"; title: string; description?: string }
  | { type: "opencode/openFile"; root: string; path: string; selection?: { start: number; end: number } }
  | { type: "opencode/saveServer"; serverUrl: string; password?: string }
  | { type: "opencode/pickFiles" }
  | { type: "opencode/install" }
  | { type: "opencode/retry" }

/** A file the extension adds to the chat composer, optionally a line range. */
export type ContextAttachment = {
  /** Absolute path on the editor's machine. */
  path: string
  /** 1-based first line, when only part of the file is attached. */
  startLine?: number
  /** 1-based last line. Defaults to `startLine`. */
  endLine?: number
}

/** Messages the extension sends to the page, which relays config and theme to the GUI. */
export type PageMessage =
  | { type: "opencode/config"; config: HostConfig }
  | { type: "opencode/theme"; theme: HostTheme }
  | ({ type: "opencode/setup" } & SetupState)
  | { type: "opencode/context"; attachments: ContextAttachment[]; auto?: boolean }
  | { type: "opencode/editors"; paths: string[]; active?: string }
  | { type: "opencode/newSession" }
