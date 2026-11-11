# OpenCode for VS Code

Unofficial VS Code extension for [OpenCode](https://opencode.ai): the whole OpenCode GUI in your
sidebar, connected to your own OpenCode server. Editor selections become attachments, file links open
at the right line, and chats run in your workspace.

Not affiliated with OpenCode or with Microsoft.

> This repository holds **only the extension**. The GUI it embeds is OpenCode's own: the build fetches
> upstream [`anomalyco/opencode`](https://github.com/anomalyco/opencode) at one pinned commit, applies
> the changes in [`patches/`](patches), then builds `packages/vscode` inside it. See [Building](#building).

## Install

- **Marketplace**: search for `OpenCode (Unofficial)`, or run
  `code --install-extension StudioVisioneo.opencode-vscode`.
- **VSIX**: download it from the [releases](https://github.com/HadrienVerrier/opencode-for-vscode/releases)
  and run `code --install-extension opencode-vscode-<version>.vsix`.
- **Open VSX** (VSCodium): `ovsx` package id `StudioVisioneo/opencode-vscode`, when published there.

With no server URL configured, the extension starts `opencode serve` in the window's folder with a
random per-process password and stops it when the window closes. It can also connect to a remote
server: `OpenCode: Configure Server`, or the gear in the view title bar to switch between servers and
sign out.

Read [packages/vscode/README.md](packages/vscode/README.md) for the full feature list, settings and
troubleshooting.

## Building

Requires [Bun](https://bun.sh) 1.4.4 and Node 20+.

```sh
bun script/build.ts
```

The script downloads the pinned upstream commit, applies `patches/opencode-gui.patch`, copies
`packages/vscode` into it, installs the monorepo, builds the webview and the extension host, and leaves
`opencode-vscode-<version>.vsix` at the repository root. Everything happens under `.build/`; nothing
outside it is modified.

To move to a newer OpenCode, bump `REF` in `script/build.ts` and regenerate the patch from your
development checkout (`git diff <upstream>..HEAD -- packages/app packages/gui-plugins packages/plugin`).

## Layout

| Path                        | What it is                                                    |
| --------------------------- | ------------------------------------------------------------- |
| `packages/vscode`           | The extension: extension host, webview bridge, tests, README   |
| `patches/opencode-gui.patch`| The GUI changes the extension needs, applied to upstream        |
| `script/build.ts`           | Fetches upstream, applies the patch, builds the VSIX            |
| `renovate.json`             | Keeps the OpenCode pin and the actions up to date               |
| `.github/workflows`         | Typecheck, tests, build, Marketplace publish on a tag           |

## Keeping up with OpenCode

The GUI is pinned to one upstream release in `script/build.ts` (`const REF = "…" // v2.x.y`). Renovate
opens a pull request when a new `vX.Y.Z` tag appears; the GitHub Actions versions are updated the same
way.

A bump is not a dependency bump: it changes the GUI code the extension embeds. Build the VSIX from the
branch and try it. If `patches/opencode-gui.patch` no longer applies, regenerate it from the
development checkout:

```sh
git diff <new-ref>..HEAD -- packages/app packages/gui-plugins packages/plugin > patches/opencode-gui.patch
```

## Releasing

```sh
git tag 0.1.1 && git push --tags
```

The workflow builds the VSIX, attaches it to a GitHub release, and publishes it to the Marketplace
when the `VSCE_PAT` secret is set. Tags are plain semver (`0.1.1`); `v0.1.1` is accepted too, and the
tag must match the version in `packages/vscode/package.json`.

First-time Marketplace setup:

1. Create a publisher at <https://marketplace.visualstudio.com/manage> whose ID matches `publisher` in
   `packages/vscode/package.json` (`StudioVisioneo`).
2. Create an Azure DevOps personal access token with **Marketplace: Manage** scope, on the same
   account.
3. Add it to the repository as the `VSCE_PAT` secret (Settings → Secrets and variables → Actions).

## AI-assisted development

This extension was developed with heavy AI assistance: the OpenCode coding agent itself wrote most of
the implementation, tests and documentation, under human direction and review. Every change was built,
type-checked, tested and installed from the packaged VSIX before it landed.

Read the source before trusting it with a password or with unattended commands. Treat it as an early,
fast-moving project rather than a vetted one.

## License

MIT. The extension code is Copyright (c) 2026 Hadrien; the OpenCode source it builds on is
Copyright (c) 2025 opencode and is redistributed under the same license. See [LICENSE](LICENSE).
