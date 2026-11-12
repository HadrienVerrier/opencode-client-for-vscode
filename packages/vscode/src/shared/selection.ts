/** How a composer attachment names its lines: 1-based, inclusive, characters unused. */
export type SelectionLines = { readonly startLine: number; readonly endLine: number }

/**
 * The lines an editor selection covers, for a composer attachment. Undefined when nothing is
 * selected, which attaches the whole file. A selection dragged upward starts after it ends, so the
 * bounds are sorted; VS Code lines are 0-based, the composer's are 1-based.
 */
export function selectionRange(selection: {
  readonly start: { readonly line: number }
  readonly end: { readonly line: number }
  readonly isEmpty: boolean
}): SelectionLines | undefined {
  if (selection.isEmpty) return undefined
  const start = selection.start.line + 1
  const end = selection.end.line + 1
  return { startLine: Math.min(start, end), endLine: Math.max(start, end) }
}

/**
 * What the model reads above the attached lines: the server sends a selection's content unlabelled, so without this
 * the model sees a snippet and cannot tell which file or lines it covers. Undefined for a whole file, which needs no
 * label.
 */
export function selectionDescription(input: {
  readonly path: string
  readonly startLine?: number
  readonly endLine?: number
}) {
  if (input.startLine === undefined) return
  const end = input.endLine ?? input.startLine
  const lines = end === input.startLine ? `${input.startLine}` : `${input.startLine}-${end}`
  return `${input.path}, lines ${lines}`
}
