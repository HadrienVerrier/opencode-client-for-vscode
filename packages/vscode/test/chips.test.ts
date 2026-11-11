import { expect, test } from "bun:test"
import { label, offeredFiles } from "../src/host/chips"

const resolve = (path: string) => path.replace("/disk/", "/work/")

test("the caret's file comes first", () => {
  expect(offeredFiles({ editors: { paths: ["/a", "/b", "/c"], active: "/c" }, attached: [], resolve })).toEqual([
    "/c",
    "/a",
    "/b",
  ])
})

test("an active file that is no longer open does not reorder the rest", () => {
  expect(offeredFiles({ editors: { paths: ["/a", "/b"], active: "/gone" }, attached: [], resolve })).toEqual([
    "/a",
    "/b",
  ])
})

test("a file attached to the prompt is not offered again", () => {
  expect(offeredFiles({ editors: { paths: ["/a", "/b"], active: "/a" }, attached: ["/b"], resolve })).toEqual(["/a"])
})

test("the attached paths are the composer's spelling of the editor's file", () => {
  expect(offeredFiles({ editors: { paths: ["/disk/a", "/disk/b"] }, attached: ["/work/a"], resolve })).toEqual([
    "/disk/b",
  ])
})

test("a chip names the file as the workspace does", () => {
  expect(label("/work/packages/app/src/index.ts", ["/work"])).toBe("packages/app/src/index.ts")
})

test("a file outside the workspace keeps its file name", () => {
  expect(label("/elsewhere/plan.md", ["/work"])).toBe("plan.md")
})

test("a windows path is named the same way", () => {
  expect(label("C:\\work\\src\\index.ts", ["C:\\work"])).toBe("src/index.ts")
})
