import { expect, test } from "bun:test"
import { webviewHtml } from "../src/shared/webview-html"

test("locks the page down to one frame origin", () => {
  const html = webviewHtml("http://127.0.0.1:47801")
  expect(html).toContain("default-src 'none'")
  expect(html).toContain("frame-src http: https:")
  expect(html).toContain('src="http://127.0.0.1:47801"')
})

test("uses a fresh nonce per page", () => {
  const nonce = (html: string) => html.match(/script-src 'nonce-([^']+)'/)![1]
  expect(nonce(webviewHtml("http://a"))).not.toBe(nonce(webviewHtml("http://a")))
})

test("retries the frame until the GUI answers", () => {
  const html = webviewHtml("http://127.0.0.1:47801")
  expect(html).toContain('data.type === "opencode/ready"')
  expect(html).toContain("frame.src = frame.src")
})
test("shows the server form until the extension sends a config", () => {
  const html = webviewHtml("http://127.0.0.1:47801")
  expect(html).toContain('id="setup" hidden')
  expect(html).toContain('type: "opencode/saveServer"')
  expect(html).toContain('data.type === "opencode/setup"')
})

test("escapes the frame url", () => {
  expect(webviewHtml('http://a/"><script>')).not.toContain("<script>")
})
