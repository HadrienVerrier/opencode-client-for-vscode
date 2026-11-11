import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { get } from "node:http"
import { join } from "node:path"
import { startAssetServer, type AssetServer } from "../src/extension/assets-server"

let root: string
let server: AssetServer

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "opencode-vscode-"))
  await writeFile(join(root, "index.html"), "<div id=root>gui</div>")
  await mkdir(join(root, "_assets"), { recursive: true })
  await writeFile(join(root, "_assets", "app.js"), "console.log(1)")
  server = await startAssetServer({ root })
})

afterAll(async () => {
  await server.close()
  await rm(root, { recursive: true, force: true })
})

test("serves index.html at the root", async () => {
  const response = await fetch(`${server.url}/`)
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/html")
  expect(await response.text()).toContain("gui")
})

test("serves built assets with their type", async () => {
  const response = await fetch(`${server.url}/_assets/app.js`)
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/javascript")
  expect(await response.text()).toBe("console.log(1)")
})

test("falls back to index.html for app routes", async () => {
  const response = await fetch(`${server.url}/session/abc/message/xyz`)
  expect(response.status).toBe(200)
  expect(await response.text()).toContain("gui")
})

test("refuses to escape the root", async () => {
  const status = await rawStatus(`/${"%2e%2e/".repeat(3)}etc/passwd`)
  expect(status).toBe(404)
})

test("answers HEAD without a body", async () => {
  const response = await fetch(`${server.url}/_assets/app.js`, { method: "HEAD" })
  expect(response.status).toBe(200)
  expect(await response.text()).toBe("")
})

test("binds loopback only", () => {
  expect(server.url.startsWith("http://127.0.0.1:")).toBe(true)
})

/** fetch normalizes dot segments before sending; a raw request reaches the server as written. */
function rawStatus(path: string) {
  return new Promise<number>((done, fail) => {
    get({ host: "127.0.0.1", port: server.port, path }, (response) => {
      response.resume()
      done(response.statusCode ?? 0)
    }).on("error", fail)
  })
}
