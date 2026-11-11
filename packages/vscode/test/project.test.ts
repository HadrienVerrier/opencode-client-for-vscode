import { expect, test } from "bun:test"
import { nameProject } from "../src/extension/project"

const requests: { url: string; method: string; body?: unknown; authorization?: string }[] = []

/** Answers `location` with `project`, then `{status}` to the rename. */
function fakeFetch(project: { id?: string; name?: string } | undefined, status = 200): typeof globalThis.fetch {
  requests.length = 0

  return (async (input: string | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input.toString() : input
    requests.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: (init?.headers as Record<string, string>)?.authorization,
    })

    return url.includes("/api/location") ? Response.json({ project }) : new Response(null, { status })
  }) as typeof globalThis.fetch
}

test("renames the project of the window's directory after its workspace", async () => {
  const result = await nameProject({
    url: "http://127.0.0.1:4096",
    password: "secret",
    directory: "/work/projects",
    name: "acme",
    fetch: fakeFetch({ id: "proj_1", name: "projects" }),
  })

  expect(result).toEqual({})
  expect(requests).toEqual([
    {
      url: "http://127.0.0.1:4096/api/location?location%5Bdirectory%5D=%2Fwork%2Fprojects",
      method: "GET",
      body: undefined,
      authorization: "Basic b3BlbmNvZGU6c2VjcmV0",
    },
    {
      url: "http://127.0.0.1:4096/api/project/proj_1",
      method: "PATCH",
      body: { name: "acme" },
      authorization: "Basic b3BlbmNvZGU6c2VjcmV0",
    },
  ])
})

test("a name that already matches sends no rename", async () => {
  expect(
    await nameProject({
      url: "http://127.0.0.1:4096",
      directory: "/work/projects",
      name: "acme",
      fetch: fakeFetch({ id: "proj_1", name: "acme" }),
    }),
  ).toEqual({})
  expect(requests).toHaveLength(1)
})

test("a name the user chose is kept", async () => {
  expect(
    await nameProject({
      url: "http://127.0.0.1:4096",
      directory: "/work/projects",
      name: "acme",
      fetch: fakeFetch({ id: "proj_1", name: "Storefront" }),
    }),
  ).toEqual({})
  expect(requests).toHaveLength(1)
})

test("a directory the server does not know is not an error", async () => {
  expect(
    await nameProject({
      url: "http://127.0.0.1:4096",
      directory: "/work/projects",
      name: "acme",
      fetch: fakeFetch(undefined),
    }),
  ).toEqual({})
  expect(requests).toHaveLength(1)
})

test("a refused rename reports why", async () => {
  expect(
    await nameProject({
      url: "http://127.0.0.1:4096",
      directory: "/work/projects",
      name: "acme",
      fetch: fakeFetch({ id: "proj_1", name: "projects" }, 403),
    }),
  ).toEqual({ error: "HTTP 403" })
})

test("an unreachable server reports why", async () => {
  const fetch = (async () => {
    throw new Error("connect ECONNREFUSED")
  }) as unknown as typeof globalThis.fetch

  expect(await nameProject({ url: "http://127.0.0.1:4096", directory: "/work/projects", name: "acme", fetch })).toEqual(
    { error: "connect ECONNREFUSED" },
  )
})
