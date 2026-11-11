import { expect, test } from "bun:test"
import { selectionRange } from "../src/shared/selection"

test("names the selected lines, 1-based", () => {
  expect(selectionRange({ start: { line: 11 }, end: { line: 13 }, isEmpty: false })).toEqual({
    startLine: 12,
    endLine: 14,
  })
})

test("sorts a selection dragged upward", () => {
  expect(selectionRange({ start: { line: 13 }, end: { line: 11 }, isEmpty: false })).toEqual({
    startLine: 12,
    endLine: 14,
  })
})

test("attaches the whole file when nothing is selected", () => {
  expect(selectionRange({ start: { line: 4 }, end: { line: 4 }, isEmpty: true })).toBeUndefined()
})
