import "@opencode/app/index.css"
import { AppBaseProviders, AppInterface, PlatformProvider, ServerConnection } from "@opencode/app/desktop"
import { render } from "solid-js/web"
import { applyTheme, config } from "./bridge"
import { createPlatform } from "./platform"

const root = document.getElementById("root")

if (!(root instanceof HTMLElement)) throw new Error("OpenCode: missing #root")

const host = await config
const platform = createPlatform(host.workspaceDirectory)
if (host.theme) applyTheme(host.theme)
const servers: ServerConnection.Any[] = host.serverUrl
  ? [{ type: "http", http: { url: host.serverUrl, password: host.password } }]
  : []

render(
  () => (
    <PlatformProvider value={platform}>
      <AppBaseProviders>
        <AppInterface servers={servers} />
      </AppBaseProviders>
    </PlatformProvider>
  ),
  root,
)
