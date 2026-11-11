# OpenCode for VS Code

> **This is not an official OpenCode extension.** It is an independent, community-built integration:
> it is not published, endorsed, or supported by the OpenCode team. It exists because OpenCode is a
> great way to work with a coding agent, and many people already spend their day in VS Code.
>
> The extension is deliberately a thin shell around the real `@opencode/app` interface, so it can be
> adopted upstream without a rewrite. If the OpenCode maintainers want to publish an official VS Code
> extension, take this one over, or move it into the OpenCode repository, that would be very welcome.

The full OpenCode coding agent in a VS Code sidebar. Point it at an OpenCode server, or let it start
one in your workspace. Same interface as the desktop and web app, same sessions, same models, with the
editor as the place where you read and write the code.

## What you get

- The full OpenCode GUI in the activity bar, or in an editor tab beside your code.
- Editor context without copy-paste: the current selection becomes an attachment, and files open in
  editor tabs are offered as one-click chips above the prompt.
- File links in a message (`src/foo.ts:12`, `../plan.md#L3-L9`) open in VS Code at the right line.
- Workspace-aware sessions: one folder runs in that folder, several folders run in their common
  ancestor, and the project is named after your workspace.
- The server password lives in VS Code Secret Storage, never in settings.
- Keybindings for the common moves, a gear button in the view title bar to switch servers and sign
  out, and an `OpenCode` output channel that says what the extension did.

## Requirements

- VS Code 1.94 or newer.
- Either an OpenCode 2 server, or the OpenCode 2 CLI on the machine where VS Code's UI runs. With no
  server URL set, the extension starts `opencode serve` itself in the window's folder, with a random
  password for that process. The CLI is looked up on `PATH` and in `~/.opencode/bin`.

  To run a server yourself instead, start it where your project lives:

  ```sh
  opencode serve --hostname 127.0.0.1 --port 4096
  ```

  Use `--hostname 0.0.0.0` when VS Code runs in another machine, container, or Remote-SSH window that
  must reach the server. Set `OPENCODE_PASSWORD` when the server requires a password.

  The extension needs OpenCode 2, not 1.x. When no version 2 binary is found it offers to run the
  installer from the OpenCode site in a terminal (`curl -fsSL https://opencode.ai/v2/install | bash`,
  or `npm install -g @opencode/cli` on Windows) and checks again when that terminal closes.

The GUI is built from the `@opencode/app` version in this repository. On activation the extension
compares the server's `/api/info` with that version and warns when the major or minor version differs,
because the client protocol moves with the server. Rebuild the extension when you upgrade the server.

## Getting started

1. Install the extension from the marketplace, or from a VSIX:
   `code --install-extension opencode-vscode-0.1.0.vsix`.
2. Click the OpenCode icon in the activity bar, or run `OpenCode: Open`.
3. With no `opencode.serverUrl` set, the extension starts a local server and connects to it. No setup
   is needed when the `opencode` CLI is already on the machine.
4. To use a server elsewhere, run `OpenCode: Configure Server` and enter its URL, for example
   `http://127.0.0.1:4096`, and the password if it has one. The form checks the server before handing
   over to the GUI. Submitting an empty URL goes back to a local server.

A pasted `http://user:pass@host:4096` is split on save: the URL goes to settings, the password goes to
Secret Storage, and the username you gave is used for Basic auth (`opencode` when you leave it out).

The view opens by itself on first run when there is nothing to connect to: no local OpenCode and no
server URL. Set `opencode.openOnStartup` to `true` if you want it to open on every start.

### Switching servers and signing out

Click the gear in the view title bar, the status bar, or run `OpenCode: Switch Server`, and pick:

- **This machine** — the server the extension starts in the window's folder.
- **The configured server** — the remote URL from settings, with its saved password.
- **Add a server…** — opens the form to enter another URL.
- **Sign out of …** — forgets that server's password but keeps its URL, so the form can sign in again.

Passwords are stored per server origin in Secret Storage, so switching between the local server and a
remote one never reuses the other credential. Signing out of the local server does nothing: its
password is random, lives in memory, and dies with the process.

## Commands

| Command                              | Effect                                          |
| ------------------------------------ | ----------------------------------------------- |
| `OpenCode: Open`                     | Reveal the sidebar view                         |
| `OpenCode: Open in Editor Tab`       | Open the GUI in an editor tab                   |
| `OpenCode: Configure Server`         | Open the server form                            |
| `OpenCode: Switch Server`            | Pick the local server or a remote one           |
| `OpenCode: Sign Out of Server`       | Forget the configured server's password         |
| `OpenCode: Install OpenCode 2`       | Run the installer in a terminal                 |
| `OpenCode: Check Server Connection`  | Run the same check as the status bar            |
| `OpenCode: Reload Webview`           | Restart the GUI iframe                          |
| `OpenCode: Add Selection to Chat`    | Attach the selected lines (editor context menu) |
| `OpenCode: Add File to Chat`         | Attach a file (editor and explorer menus)       |
| `OpenCode: Add Open Editors to Chat` | Attach every file open in a tab                 |
| `OpenCode: New Chat`                 | Open a new chat tab                             |

Shortcuts, in the editor only:

| Shortcut                   | Effect               |
| -------------------------- | -------------------- |
| `Ctrl+Alt+O` / `Cmd+Alt+O` | Reveal the view      |
| `Ctrl+Alt+N` / `Cmd+Alt+N` | Open a new chat      |
| `Ctrl+Alt+A` / `Cmd+Alt+A` | Attach the selection |

The status bar shows `OpenCode <version>` when `/api/info` answers, `OpenCode: offline` when it does
not, `OpenCode: install` when no OpenCode 2 binary is on the machine, and `OpenCode: no server` when
neither a URL nor a local server is available. Clicking it opens the server picker. Returning focus to
VS Code also retries the check, so a restarted server comes back without a reload; a repeated failure
is reported once, not on every focus.

## Editor context

Attaching the selection needs no gesture: selecting code in a file editor hands it to the routed chat
after 400 ms of quiet, the way Copilot adds the current selection as implicit context. A drag counts as
one selection, the chat is never revealed (the editor keeps focus), and the same lines attach once.

The composer lane shows one greyed chip per file open in the editor, the active one first and brighter.
Clicking a chip attaches that whole file to the prompt and the chip goes away. A file already attached
as a card above the prompt is no longer offered, and removing the card offers it again.

## Workspaces and projects

A chat runs in the window's folders, and that directory is what the GUI opens Home and new chats in,
ahead of whichever project was used last anywhere else.

- One folder is the directory, and the project keeps the folder's name.
- Several folders have no directory of their own, so the chat runs in their **common ancestor**, named
  after the workspace: the `name` a `.code-workspace` declares, else its file name
  (`shop.code-workspace` becomes `shop`). Folders with no common directory fall back to the workspace
  file's folder, then to the first folder; the filesystem root is never used.
- With no folder open, the chat runs in the active file's folder.
- A project you renamed by hand keeps your name.

Adding or removing a folder reloads the GUI, because the directory it runs in moved.

## Settings

| Setting                  | Meaning                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `opencode.serverUrl`     | OpenCode server, for example `http://127.0.0.1:4096`       |
| `opencode.webviewPort`   | Loopback port for the GUI (`0` picks one and remembers it) |
| `opencode.openOnStartup` | Reveal the view at startup                                 |

## How it works

- `dist/host` is the real `@opencode/app` GUI built from source, served on `127.0.0.1:<port>`.
- The webview is a thin page that hosts the GUI in an iframe and relays messages.
- The extension only connects to a server; when `opencode.serverUrl` is empty it starts one itself:
  `opencode serve --stdio --port 0` in the window's folder, with a random password for that process.
  The server exits when its stdin closes, so closing the window or deactivating the extension leaves
  no stray process.

The GUI needs a real HTTP origin. The server's CORS allows `http://127.0.0.1:*` but not
`vscode-webview://`, so the asset server exists. This is a `ui` extension, so the extension and the
webview run on the same machine: URLs are used as-is and are never rewritten through
`vscode.env.asExternalUri`, which in Remote-SSH would tunnel them to the remote host where no asset
server runs.

A path the agent writes in a message opens in VS Code at that line range through a GUI plugin this
build adds beside the app's built-ins. The plugin is aliased over `@opencode/gui-plugins/renderer` in
`vite.config.ts`, so `packages/app` and `packages/gui-plugins` stay untouched. The path is mapped into
the editor's workspace folders (including a session that sits in a subdirectory), then, when nothing
matches, looked up by suffix in the editor's own index, so a link written from a subdirectory
(`config/application.php` for `core/config/application.php`) still opens. A URL, a `file://` link and
an absolute path outside the workspace stay with the GUI's file panel, and the extension warns when it
cannot find the file on its machine.

## AI-assisted development

This extension was developed with heavy AI assistance: the OpenCode coding agent itself wrote most of
the implementation, tests and documentation, under human direction and review. Every change was built,
type-checked, tested and installed from the packaged VSIX before it landed.

Read the source before trusting it with a password or with unattended commands. Treat it as an early,
fast-moving project rather than a vetted one.

## Troubleshooting

Open `Output: OpenCode` (`View > Output`, then choose "OpenCode"). It logs the port the GUI is served
on, the result of every server check, and the project it named.

- **The view is blank.** The GUI is not built. Run `bun run build:host` in `packages/vscode`.
- **`OpenCode: install`.** No OpenCode 2 CLI was found on `PATH` or in `~/.opencode/bin`. Click the
  status bar, then **Install**, or run `OpenCode: Install OpenCode 2`. The installer opens in a
  terminal; the extension checks again when that terminal closes. A 1.x binary is reported the same
  way, and the installer adds 2 next to it.
- **`OpenCode: offline`.** The server is not reachable from the machine where VS Code's UI runs. In
  Remote-SSH, that is your local machine: use a URL the local machine can reach, or forward the port.
- **The password is rejected.** Run `OpenCode: Sign Out of Server`, then `OpenCode: Configure Server`
  and enter it again.
- **A version warning.** The GUI and the server are from different releases. Rebuild the extension
  against the same `@opencode/app` version, or upgrade the server.

## Building from source

```sh
cd packages/vscode
bun run build          # GUI (vite) + extension (esbuild)
bun run typecheck      # extension and host sources
bun test test
bun run package        # opencode-vscode-0.1.0.vsix
code --install-extension opencode-vscode-0.1.0.vsix
```

To iterate instead, open `packages/vscode` in VS Code, press F5, then run `OpenCode: Configure Server`
from the palette.

## Privacy

The extension talks to the server you configure and nowhere else. Chat content, files, and credentials
are handled by that server, the same way they are in the desktop and web app. The password is stored in
VS Code Secret Storage, not in `settings.json`.

## License and trademark

MIT. See [LICENSE](LICENSE).

OpenCode and the OpenCode logo belong to the OpenCode project. They are used here only to describe what
this extension connects to. This extension is not affiliated with or endorsed by the OpenCode team; see
the notice at the top of this page.
