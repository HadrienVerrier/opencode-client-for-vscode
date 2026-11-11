import { afterAll, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { installCommand, parseVersion, startLocalServer } from "../src/extension/local-server"

const roots: string[] = []
afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })))

test("reads the version wherever it sits in the output", () => {
  expect(parseVersion("opencode v2.2.6")).toBe("2.2.6")
  expect(parseVersion("1.19.5")).toBe("1.19.5")
  expect(parseVersion("no version here")).toBeUndefined()
})

test("offers the installer each platform documents", () => {
  expect(installCommand("linux")).toBe("curl -fsSL https://opencode.ai/v2/install | bash")
  expect(installCommand("darwin")).toBe("curl -fsSL https://opencode.ai/v2/install | bash")
  expect(installCommand("win32")).toBe("npm install -g @opencode/cli")
})

test.skipIf(process.platform === "win32")("starts a server and takes its address from the ready line", async () => {
  const root = mkdtempSync(join(tmpdir(), "opencode-vscode-local-"))
  roots.push(root)
  const binary = join(root, "opencode")
  // A server that reports its address on stdout and keeps running until its stdin closes.
  writeFileSync(binary, '#!/bin/sh\necho \'{"url":"http://127.0.0.1:4444"}\'\nexec cat > /dev/null\n')
  chmodSync(binary, 0o755)

  const result = await startLocalServer({ binary, directory: root, timeout: 5_000 })
  expect(result.error).toBeUndefined()
  expect(result.server?.url).toBe("http://127.0.0.1:4444")
  expect(result.server?.port).toBe(4444)
  // The credential stays in this process: it is what the window sends, and nothing on disk knows it.
  expect(result.server?.password.length).toBeGreaterThan(20)

  result.server?.stop()
  await result.server?.exited
})

test.skipIf(process.platform === "win32")("reports a binary that never reports an address", async () => {
  const root = mkdtempSync(join(tmpdir(), "opencode-vscode-local-"))
  roots.push(root)
  const binary = join(root, "opencode")
  writeFileSync(binary, "#!/bin/sh\nsleep 30\n")
  chmodSync(binary, 0o755)

  const result = await startLocalServer({ binary, directory: root, timeout: 300 })
  expect(result.server).toBeUndefined()
  expect(result.error).toContain("did not start")
})
