import { pathName } from "../shared/workspace"
import { basicAuth } from "./server-info"

type Location = { project?: { id?: string; name?: string } }

/**
 * Names the server's project for a directory after the editor's workspace.
 *
 * A window with several folders runs its chats in their common ancestor, so the project takes the ancestor's name, which
 * says nothing about the work. The rename happens once: a name the user set is kept, as is a name already applied.
 */
export async function nameProject(input: {
  url: string
  username?: string
  password?: string
  directory: string
  name: string
  fetch?: typeof globalThis.fetch
}): Promise<{ error?: string }> {
  const request = input.fetch ?? globalThis.fetch
  const headers: Record<string, string> = input.password
    ? { authorization: basicAuth(input.password, input.username) }
    : {}
  const url = new URL("api/location", `${input.url.replace(/\/+$/, "")}/`)
  url.searchParams.set("location[directory]", input.directory)

  const response = await request(url, { headers }).catch((cause: unknown) => cause)
  if (!(response instanceof Response)) return { error: reason(response) }
  // The server has no project for a directory it cannot see, such as a Remote-SSH folder it does not run on.
  if (response.status === 404) return {}
  if (!response.ok) return { error: `HTTP ${response.status}` }

  const location = (await response.json().catch(() => undefined)) as Location | undefined
  const project = location?.project
  if (!project?.id || project.name === input.name) return {}
  // Only the default name is replaced: a project the user renamed keeps their name.
  if (project.name && project.name !== pathName(input.directory)) return {}

  const patched = await request(`${input.url.replace(/\/+$/, "")}/api/project/${encodeURIComponent(project.id)}`, {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ name: input.name }),
  }).catch((cause: unknown) => cause)

  if (!(patched instanceof Response)) return { error: reason(patched) }
  if (!patched.ok) return { error: `HTTP ${patched.status}` }

  return {}
}

function reason(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}
