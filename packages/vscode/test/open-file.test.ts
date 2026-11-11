import { expect, test } from "bun:test"
import { insideFolder, isEditorLink, openCandidates, suffixPattern } from "../src/shared/open-file"

test("tries a relative path in every workspace folder", () => {
  const folders = ["/srv/app", "/srv/other"]

  expect(openCandidates({ root: "/srv/app", path: "src/a.ts" }, folders)).toEqual([
    { folder: 0, relative: "src/a.ts" },
    { folder: 1, relative: "src/a.ts" },
  ])
})

test("maps a session inside a subdirectory of the open folder", () => {
  // The reported bug: the server session sits in `pilot`, the editor has the repository root open.
  expect(
    openCandidates(
      { root: "/home/me/work/studio/charts/pilot", path: "/home/me/work/studio/charts/pilot/mdb/mdb.yaml" },
      ["/home/me/work/studio"],
    ),
  ).toEqual([
    { folder: 0, relative: "charts/pilot/mdb/mdb.yaml" },
    { folder: 0, relative: "mdb/mdb.yaml" },
    { absolute: "/home/me/work/studio/charts/pilot/mdb/mdb.yaml" },
  ])
})

test("keeps an absolute path the session root does not contain", () => {
  expect(openCandidates({ root: "/srv/app", path: "/etc/hosts" }, ["/srv"])).toEqual([{ absolute: "/etc/hosts" }])
})

test("normalizes backslashes and a trailing separator", () => {
  expect(openCandidates({ root: "C:\\work\\app\\", path: "C:\\work\\app\\src\\a.ts" }, ["C:\\work"])).toEqual([
    { folder: 0, relative: "app/src/a.ts" },
    { folder: 0, relative: "src/a.ts" },
    { absolute: "C:/work/app/src/a.ts" },
  ])
})

test("compares folders by segment, not by prefix text", () => {
  expect(insideFolder("/srv/app/src/a.ts", "/srv/app")).toBe(true)
  expect(insideFolder("/srv/apple/a.ts", "/srv/app")).toBe(false)
  expect(insideFolder("/srv/app", "/srv/app/")).toBe(true)
  expect(insideFolder("C:\\work\\app\\a.ts", "c:/work/app")).toBe(true)
})

test("claims paths but not URLs, anchors or bare words", () => {
  const folders = ["/opt/project"]

  expect(isEditorLink("src/a.ts:12", folders)).toBe(true)
  expect(isEditorLink("../a.md#L3-L9", folders)).toBe(true)
  expect(isEditorLink("/opt/project/src/a.ts", folders)).toBe(true)
  expect(isEditorLink("C:\\work\\a.ts", ["C:/work"])).toBe(true)

  expect(isEditorLink("https://example.com/a.ts", folders)).toBe(false)
  expect(isEditorLink("file:///opt/project/a.ts", folders)).toBe(false)
  expect(isEditorLink("skill://review/a.md", folders)).toBe(false)
  expect(isEditorLink("#section", folders)).toBe(false)
  expect(isEditorLink("test", folders)).toBe(false)
  expect(isEditorLink("/etc/hosts", folders)).toBe(false)
})

test("searches by suffix when a link names only the tail of a file", () => {
  // `config/application.php` written from `core/`: exact paths miss, the editor's index finds it.
  expect(suffixPattern({ root: "/srv/app", path: "config/application.php" })).toBe("**/config/application.php")
  expect(suffixPattern({ root: "/srv/app", path: "/srv/app/core/config/application.php" })).toBe(
    "**/core/config/application.php",
  )
  expect(suffixPattern({ root: "/srv/app", path: "/etc/hosts" })).toBeUndefined()
  expect(suffixPattern({ root: "/srv/app", path: "a[1]*.ts" })).toBe("**/a\\[1\\]\\*.ts")
})
