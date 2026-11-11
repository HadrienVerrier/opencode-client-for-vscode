import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/** How long the CLI gets to report the port it bound before the attempt counts as failed. */
const START_TIMEOUT_MS = 20_000
/** `opencode --version` answers at once; a hung binary must not hold the extension. */
const VERSION_TIMEOUT_MS = 5_000

export type LocalServer = {
  url: string
  port: number
  /** Per-process Basic auth credential: the server's lease, never stored on disk. */
  password: string
  /** Ends the server's stdin lease and kills it. */
  stop: () => void
  /** Resolves when the process is gone, whichever side ended it. */
  exited: Promise<void>
}

export type FindResult =
  | { found: { binary: string; version: string } }
  | { error: { reason: "missing" | "outdated"; version?: string } }

/**
 * The `opencode` binary to drive, and its version.
 *
 * The installer puts OpenCode in `~/.opencode/bin`, which a VS Code launched from the dock does not
 * have on its PATH, so both that and the PATH entry are tried. Version 2 is required: the flags and
 * the protocol this extension uses do not exist in the 1.x CLI.
 */
export async function findOpenCode(input: { home?: string } = {}): Promise<FindResult> {
  const home = input.home ?? homedir()
  const installed = join(home, ".opencode", "bin", process.platform === "win32" ? "opencode.exe" : "opencode")
  let outdated: string | undefined

  // PATH first: a user who manages their own install expects that one to win.
  for (const binary of ["opencode", installed]) {
    const output = await run(binary, ["--version"])
    const version = output && parseVersion(output)
    if (!version) continue
    if (major(version) === 2) return { found: { binary, version } }
    outdated = version
  }

  return outdated ? { error: { reason: "outdated", version: outdated } } : { error: { reason: "missing" } }
}

/** `opencode --version` prints `opencode v2.2.6`; the number is what matters, wherever it sits. */
export function parseVersion(output: string) {
  return /(\d+)\.(\d+)\.(\d+)/.exec(output)?.[0]
}

function major(version: string) {
  return Number(version.split(".")[0])
}

/** The command the OpenCode site gives for a machine without OpenCode 2. */
export function installCommand(platform = process.platform) {
  // PowerShell treats `curl` as an alias and rejects these flags, so Windows gets the npm channel the
  // site lists, which works from the default terminal.
  return platform === "win32" ? "npm install -g @opencode/cli" : "curl -fsSL https://opencode.ai/v2/install | bash"
}

/**
 * Starts `opencode serve` for this window, the way the CLI's standalone mode does: a random Basic auth
 * password in the environment, port 0 unless a remembered port is free, and one JSON line on stdout
 * with the bound address. The server exits when its stdin closes, so killing the extension takes it
 * down without a stray process.
 */
export function startLocalServer(input: {
  binary: string
  directory?: string
  port?: number
  timeout?: number
}): Promise<{ server?: LocalServer; error?: string; portInUse?: boolean }> {
  const password = randomBytes(32).toString("base64url")
  const directory = input.directory && existsSync(input.directory) ? input.directory : undefined
  const child = spawn(input.binary, ["serve", "--stdio", "--port", String(input.port ?? 0)], {
    cwd: directory,
    // The lease credential is explicit: an OPENCODE_PASSWORD exported in the user's shell must not
    // become the password this window knows.
    env: { ...process.env, OPENCODE_PASSWORD: password },
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
    windowsHide: true,
  })

  return new Promise((resolve) => {
    let settled = false
    let stdout = ""
    let stderr = ""
    let stopped = false

    const exit = new Promise<void>((done) => child.once("exit", () => done()))
    const stop = () => {
      stopped = true
      child.stdin?.end()
      child.kill()
    }
    const finish = (result: { server?: LocalServer; error?: string; portInUse?: boolean }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      stop()
      finish({ error: `OpenCode did not start within ${Math.round((input.timeout ?? START_TIMEOUT_MS) / 1000)}s.` })
    }, input.timeout ?? START_TIMEOUT_MS)

    child.stdout?.setEncoding("utf8")
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim().startsWith("{")) continue
        const url = readyUrl(line)
        if (!url) continue
        finish({
          server: {
            url,
            port: Number(new URL(url).port),
            password,
            stop,
            exited: exit,
          },
        })
        return
      }
    })
    child.stderr?.setEncoding("utf8")
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000)
    })
    child.once("error", (cause: Error) => finish({ error: cause.message }))
    child.once("exit", (code, signal) => {
      if (stopped || settled) return
      const tail = stderr.trim()
      const portInUse = /EADDRINUSE|already in use/i.test(tail)
      finish({
        error: `OpenCode exited before it was ready (${signal ?? code ?? "unknown"})${tail ? `: ${tail}` : ""}`,
        portInUse,
      })
    })
  })
}

function readyUrl(line: string) {
  try {
    const value = JSON.parse(line) as { url?: unknown }
    if (typeof value.url !== "string" || !URL.canParse(value.url)) return undefined
    return value.url
  } catch {
    return undefined
  }
}

function run(binary: string, args: readonly string[]) {
  return new Promise<string | undefined>((resolve) => {
    const child = spawn(binary, [...args], {
      stdio: ["ignore", "pipe", "ignore"],
      shell: process.platform === "win32",
      windowsHide: true,
    })
    let output = ""
    const timer = setTimeout(() => {
      child.kill()
      resolve(undefined)
    }, VERSION_TIMEOUT_MS)

    child.stdout.on("data", (chunk) => (output += chunk))
    child.once("error", () => {
      clearTimeout(timer)
      resolve(undefined)
    })
    child.once("exit", () => {
      clearTimeout(timer)
      resolve(output || undefined)
    })
  })
}
