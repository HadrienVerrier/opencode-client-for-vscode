import { expect, test } from "bun:test"
import { basicAuth, checkServer, compatible, normalizeServerUrl, parseServerUrl } from "../src/extension/server-info"

test("normalizes a server url", () => {
  expect(normalizeServerUrl(" 127.0.0.1:4096 ")).toBe("http://127.0.0.1:4096")
  expect(normalizeServerUrl("https://box:4096///")).toBe("https://box:4096")
  expect(normalizeServerUrl("   ")).toBeUndefined()
})

test("strips credentials out of a pasted url", () => {
  expect(parseServerUrl("http://opencode:opencode@192.168.1.30:4096")).toEqual({
    url: "http://192.168.1.30:4096",
    username: "opencode",
    password: "opencode",
  })
  expect(parseServerUrl("http://opencode:p%40ss@box:4096/")).toEqual({
    url: "http://box:4096",
    username: "opencode",
    password: "p@ss",
  })
  expect(parseServerUrl("192.168.1.30:4096")).toEqual({
    url: "http://192.168.1.30:4096",
    username: undefined,
    password: undefined,
  })
  expect(parseServerUrl("http://not a url")).toBeUndefined()
})

test("builds opencode basic auth", () => {
  expect(basicAuth("secret")).toBe(`Basic ${btoa("opencode:secret")}`)
  expect(basicAuth("secret", "other")).toBe(`Basic ${btoa("other:secret")}`)
})

test("checks a healthy server", async () => {
  const seen: { url?: string; authorization?: string } = {}
  const result = await checkServer({
    url: "http://127.0.0.1:4096",
    password: "secret",
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.url = String(input)
      seen.authorization = new Headers(init?.headers).get("authorization") ?? undefined
      return new Response(JSON.stringify({ version: "2.2.7" }), { status: 200 })
    }) as typeof fetch,
  })

  expect(result).toEqual({ ok: true, version: "2.2.7", compatible: true })
  expect(seen.url).toBe("http://127.0.0.1:4096/api/info")
  expect(seen.authorization).toBe(basicAuth("secret"))
})

test("checks with the credentials of a pasted url", async () => {
  const parsed = parseServerUrl("http://opencode:opencode@192.168.1.30:4096")!
  let authorization: string | undefined
  const result = await checkServer({
    url: parsed.url,
    username: parsed.username,
    password: parsed.password,
    fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? undefined
      return new Response(JSON.stringify({ version: "2.2.7" }), { status: 200 })
    }) as typeof fetch,
  })

  expect(result.ok).toBe(true)
  expect(authorization).toBe(basicAuth("opencode"))
})

test("reports rejected credentials", async () => {
  const result = await checkServer({
    url: "http://127.0.0.1:4096",
    fetch: (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch,
  })
  expect(result).toEqual({ ok: false, status: 401, error: "HTTP 401" })
})

test("reports an unreachable server", async () => {
  const result = await checkServer({
    url: "http://127.0.0.1:4096",
    fetch: (async () => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch,
  })
  expect(result).toEqual({ ok: false, error: "ECONNREFUSED" })
})

test("pairs versions by major and minor", () => {
  expect(compatible("2.2.6")).toBe(true)
  expect(compatible("2.3.0")).toBe(false)
  expect(compatible("3.2.0")).toBe(false)
})
