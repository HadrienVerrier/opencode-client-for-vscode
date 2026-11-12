# Changelog

## 0.2.1

- A file or line selection shared with the chat stays visible under the sent message as a card naming its lines
  (`Chart.yaml:18-19`), instead of leaving no trace once the composer clears.

## 0.2.0

- Attached line selections reach the model labelled with their file and lines (`Description: path, lines 18-19`),
  instead of an unlabelled snippet under the file name.
- The extension adopts the password the GUI signed in with, so the status bar checks the same server and shows the
  version instead of a sign-in notice.
- The status bar switches server or configures the connection when clicked.
- The sidebar and editor tab paint the editor background while the GUI boots, so it no longer flashes white.

## 0.1.1

- Repository renamed to `opencode-client-for-vscode`; marketplace links updated.

## 0.1.0

First public release. Unofficial community extension, not published or endorsed by the OpenCode team.

- The full OpenCode GUI in the VS Code sidebar, or in an editor tab.
- Editor context: the selection attaches itself, files open in editor tabs become one-click chips, and
  file links open in VS Code at their line range.
- Workspace-aware chats: a multi-root window runs in the common ancestor of its folders, named after
  the workspace; a window with no folder runs in the active file's folder.
- Server password in VS Code Secret Storage, an `OpenCode` output channel, keybindings for reveal, new
  chat and attach selection, and the editor tab restored after a window reload.
- With no server URL set, the extension starts `opencode serve` in the window's folder with a random
  per-process password and stops it when the window closes.
- `OpenCode: Switch Server` picks between the local server and a remote one; `OpenCode: Sign Out of
Server` forgets the remote server's password. Passwords are stored per server origin.
- When no OpenCode 2 CLI is found, an install prompt runs the official installer in a terminal and
  checks again when that terminal closes.
