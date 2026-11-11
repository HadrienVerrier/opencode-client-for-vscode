import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, normalize, resolve, sep } from "node:path"

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
}

export type AssetServer = {
  readonly url: string
  readonly port: number
  close(): Promise<void>
}

/**
 * Serves the built GUI on loopback. The webview needs a real HTTP origin: the server's CORS allows
 * `http://127.0.0.1:*` and not `vscode-webview://`.
 */
export async function startAssetServer(input: { root: string; port?: number; host?: string }): Promise<AssetServer> {
  const root = resolve(input.root)
  const host = input.host ?? "127.0.0.1"
  const server = createServer((request, response) => {
    void serve(root, request.url, request.method, response)
  })

  const port = await listen(server, host, input.port ?? 0).catch((cause: NodeJS.ErrnoException) => {
    // A remembered port can be taken by another process; any free port keeps the GUI working, only
    // the browser storage of that origin is lost.
    if (cause.code === "EADDRINUSE" && (input.port ?? 0) !== 0) return listen(server, host, 0)
    throw cause
  })

  return {
    url: `http://${host}:${port}`,
    port,
    close: () => new Promise((done, fail) => server.close((error) => (error ? fail(error) : done()))),
  }
}

function listen(server: ReturnType<typeof createServer>, host: string, port: number) {
  return new Promise<number>((done, fail) => {
    server.once("error", fail)
    server.listen(port, host, () => {
      server.off("error", fail)
      const address = server.address()
      if (!address || typeof address === "string") return fail(new Error("asset server has no port"))
      done(address.port)
    })
  })
}

async function serve(
  root: string,
  rawUrl: string | undefined,
  method: string | undefined,
  response: import("node:http").ServerResponse,
) {
  if (method !== "GET" && method !== "HEAD") return send(response, 405, "text/plain", "method not allowed")

  const raw = rawUrl ?? "/"
  const decoded = (() => {
    try {
      return decodeURIComponent(raw.split(/[?#]/)[0] || "/")
    } catch {
      return undefined
    }
  })()
  if (decoded === undefined || !decoded.startsWith("/")) return send(response, 404, "text/plain", "not found")

  const file = normalize(join(root, decoded === "/" ? "/index.html" : decoded))

  if (file !== root && !file.startsWith(root + sep)) return send(response, 404, "text/plain", "not found")

  const data = await readFile(file).catch(() => undefined)
  if (data) return send(response, 200, MIME[extname(file)] ?? "application/octet-stream", data, file, method)

  if (extname(file)) return send(response, 404, "text/plain", "not found")

  const index = await readFile(join(root, "index.html")).catch(() => undefined)
  if (!index) return send(response, 404, "text/plain", "not found")

  return send(response, 200, MIME[".html"], index, join(root, "index.html"), method)
}

function send(
  response: import("node:http").ServerResponse,
  status: number,
  type: string,
  body: string | Buffer,
  file?: string,
  method?: string,
) {
  response.writeHead(status, {
    "content-type": type,
    "content-length": Buffer.byteLength(body),
    "cache-control": status !== 200 ? "no-store" : file?.endsWith(".html") ? "no-store" : "public, max-age=3600",
    "x-content-type-options": "nosniff",
  })
  response.end(method === "HEAD" ? undefined : body)
}
