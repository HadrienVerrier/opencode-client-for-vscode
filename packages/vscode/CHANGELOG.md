# Changelog

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
