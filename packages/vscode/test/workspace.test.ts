import { expect, test } from "bun:test"
import { workspaceContext } from "../src/shared/workspace"

test("one folder is the directory, and its name the project", () => {
  expect(workspaceContext({ folders: ["/work/acme"] })).toEqual({ directory: "/work/acme", name: "acme" })
})

test("a folder with a trailing separator keeps its name", () => {
  expect(workspaceContext({ folders: ["/work/acme/"] })).toEqual({ directory: "/work/acme/", name: "acme" })
})

test("several folders run in their common ancestor, named after the workspace file", () => {
  expect(
    workspaceContext({
      folders: ["/work/shop/api", "/work/shop/web"],
      file: { path: "/work/shop.code-workspace" },
    }),
  ).toEqual({ directory: "/work/shop", name: "shop" })
})

test("a workspace file that declares a name wins over its file name", () => {
  expect(
    workspaceContext({
      folders: ["/work/shop/api", "/work/shop/web"],
      file: { path: "/work/shop.code-workspace", content: '{"folders": [], "name": "  Storefront  "}' },
    }),
  ).toEqual({ directory: "/work/shop", name: "Storefront" })
})

test("a workspace file that is not JSON falls back to its file name", () => {
  expect(
    workspaceContext({
      folders: ["/work/shop/api", "/work/shop/web"],
      file: { path: "/work/shop.code-workspace", content: "{" },
    }),
  ).toEqual({ directory: "/work/shop", name: "shop" })
})

test("an unsaved workspace runs in the common ancestor, named by VS Code's title", () => {
  expect(workspaceContext({ folders: ["/work/a", "/work/b"], title: "proj (Workspace)" })).toEqual({
    directory: "/work",
    name: "proj",
  })
})

test("folders with no common directory fall back to the workspace file's folder", () => {
  expect(
    workspaceContext({
      folders: ["/home/me/one", "/srv/two"],
      file: { path: "/home/me/workspaces/work.code-workspace" },
    }),
  ).toEqual({ directory: "/home/me/workspaces", name: "work" })
})

test("folders with no common directory and no workspace file fall back to the first folder", () => {
  expect(workspaceContext({ folders: ["/home/me/one", "/srv/two"] })).toEqual({
    directory: "/home/me/one",
    name: "one",
  })
})

test("a prefix of another folder's name is not inside it", () => {
  expect(workspaceContext({ folders: ["/work/app", "/work/api"] })).toEqual({ directory: "/work", name: "work" })
  expect(workspaceContext({ folders: ["/work/app", "/work/application"] })).toEqual({
    directory: "/work",
    name: "work",
  })
})

test("windows folders keep their separator", () => {
  expect(workspaceContext({ folders: ["C:\\work\\api", "C:\\work\\web"] })).toEqual({
    directory: "C:\\work",
    name: "work",
  })
})

test("windows folders on different drives fall back to the first folder", () => {
  expect(workspaceContext({ folders: ["C:\\one", "D:\\two"] })).toEqual({ directory: "C:\\one", name: "one" })
})

test("no folder runs in the active file's folder", () => {
  expect(workspaceContext({ folders: [], activeFile: "/work/acme/src/index.ts" })).toEqual({
    directory: "/work/acme/src",
    name: "src",
  })
})

test("nothing open lets the server choose", () => {
  expect(workspaceContext({ folders: [] })).toBeUndefined()
})
