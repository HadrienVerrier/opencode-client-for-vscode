import app from "../../../app/package.json"

/** The GUI in this extension is built from this app version; `api/info` is compared against it. */
export const GUI_VERSION = app.version

/** Splits `http://user:pass@host:port` into a fetchable URL and the credentials the server expects. */
export function parseServerUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return

  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
  const candidate = withProtocol.replace(/\/+$/, "")
  if (!URL.canParse(candidate)) return

  const url = new URL(candidate)
  // fetch rejects URLs with credentials, so they leave the URL and ride the Authorization header instead.
  const username = url.username ? decodeURIComponent(url.username) : undefined
  const password = url.password ? decodeURIComponent(url.password) : undefined
  url.username = ""
  url.password = ""

  return { url: url.toString().replace(/\/+$/, ""), username, password }
}

export function normalizeServerUrl(input: string) {
  return parseServerUrl(input)?.url
}

export function basicAuth(password: string, username = "opencode") {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

export type ServerCheck =
  | { ok: true; version: string; compatible: boolean }
  | { ok: false; status?: number; error: string }

export async function checkServer(input: {
  url: string
  username?: string
  password?: string
  fetch?: typeof globalThis.fetch
}): Promise<ServerCheck> {
  const fetch = input.fetch ?? globalThis.fetch

  const response = await fetch(new URL("api/info", input.url.endsWith("/") ? input.url : `${input.url}/`), {
    headers: input.password ? { authorization: basicAuth(input.password, input.username) } : undefined,
  }).catch((cause: unknown) => cause)

  if (!(response instanceof Response))
    return { ok: false, error: response instanceof Error ? response.message : String(response) }

  if (!response.ok) return { ok: false, status: response.status, error: `HTTP ${response.status}` }

  const body = (await response.json().catch(() => undefined)) as { version?: string } | undefined
  if (!body?.version) return { ok: false, error: "response has no version" }

  return { ok: true, version: body.version, compatible: compatible(body.version) }
}

/** Major.minor parity: the client and server protocols move together. */
export function compatible(version: string) {
  const [major, minor] = version.split(".")
  const [guiMajor, guiMinor] = GUI_VERSION.split(".")
  return major === guiMajor && minor === guiMinor
}
