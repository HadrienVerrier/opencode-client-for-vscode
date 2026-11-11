import type { Platform } from "@opencode/app/desktop"
import { send } from "./bridge"

/** The `web` platform, with the browser-only bits routed to the extension where VS Code can do better. */
export function createPlatform(workspaceDirectory?: string): Platform {
  return {
    platform: "web",
    workspaceDirectory,
    openExternal(url) {
      send({ type: "opencode/openExternal", url })
    },
    restart: async () => {
      window.location.reload()
    },
    notify: async (title, description) => {
      send({ type: "opencode/notify", title, description })
    },
  }
}
