import { expect, test } from "bun:test"
import { selectionDescription, selectionRange } from "../src/shared/selection"

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

test("labels the attached lines for the model", () => {
  expect(selectionDescription({ path: "helm/Chart.yaml", startLine: 18, endLine: 19 })).toBe(
    "helm/Chart.yaml, lines 18-19",
  )
  expect(selectionDescription({ path: "helm/Chart.yaml", startLine: 18, endLine: 18 })).toBe(
    "helm/Chart.yaml, lines 18",
  )
})

test("a whole file needs no label", () => {
  expect(selectionDescription({ path: "helm/Chart.yaml" })).toBeUndefined()
})
