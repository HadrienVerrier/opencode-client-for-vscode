import { cp, mkdir, rm } from "node:fs/promises"
import { join } from "node:path"

/**
 * Builds the VSIX from this repository alone: the extension needs the OpenCode GUI around it, so the
 * script fetches upstream at one pinned commit, applies the GUI patch, drops `packages/vscode` in and
 * builds there. Everything it writes lives under `.build/`.
 */
const REPO = "anomalyco/opencode"
// Renovate bumps this line: the tag is what it tracks, the commit is what the build downloads.
const REF = "fedc6f208aa2bd54c1019227214568083f6380ad" // v2.2.7

const root = join(import.meta.dir, "..")
const build = join(root, ".build")
const upstream = join(build, "upstream")
const work = join(build, "work")

if (!(await Bun.file(join(upstream, "package.json")).exists())) {
  const tarball = join(build, "opencode.tar.gz")
  if (!(await Bun.file(tarball).exists())) {
    console.log(`opencode-vscode: downloading ${REPO}@${REF.slice(0, 7)}`)
    await mkdir(build, { recursive: true })
    const response = await fetch(`https://github.com/${REPO}/archive/${REF}.tar.gz`)
    if (!response.ok) throw new Error(`OpenCode: cannot download ${REPO}@${REF}: HTTP ${response.status}`)
    await Bun.write(tarball, response)
  }
  console.log("opencode-vscode: extracting upstream")
  await mkdir(upstream, { recursive: true })
  await Bun.$`tar -xzf ${tarball} -C ${upstream} --strip-components=1`.quiet()
}

// The patch must apply to a pristine tree, so every build starts from a copy of it.
await rm(work, { recursive: true, force: true })
await cp(upstream, work, { recursive: true })
// `.build` can sit inside a git checkout; without a ceiling, `git apply` resolves the patch paths
// against that repository instead of the extracted tree and silently skips every file.
const patch = join(root, "patches/opencode-gui.patch")
await Bun.$`GIT_CEILING_DIRECTORIES=${build} git apply --whitespace=nowarn ${patch}`.cwd(work)
// The patch creates this file: its absence means the patch was skipped, not applied.
if (!(await Bun.file(join(work, "packages/app/src/runtime/plugin/screen-surface.ts")).exists())) {
  throw new Error("OpenCode: patches/opencode-gui.patch did not apply")
}
await cp(join(root, "packages/vscode"), join(work, "packages/vscode"), {
  recursive: true,
  filter: (source) => !/(\/node_modules|\/dist)(\/|$)|\.vsix$/.test(source),
})

console.log("opencode-vscode: installing")
await Bun.$`bun install --ignore-scripts`.cwd(work)
console.log("opencode-vscode: building")
await Bun.$`bun run build`.cwd(join(work, "packages/vscode"))
await Bun.$`bun x @vscode/vsce package --no-dependencies`.cwd(join(work, "packages/vscode"))
await Bun.$`cp ${join(work, "packages/vscode")}/opencode-vscode-*.vsix ${root}`.quiet()
console.log("opencode-vscode: packaged into the repository root")
