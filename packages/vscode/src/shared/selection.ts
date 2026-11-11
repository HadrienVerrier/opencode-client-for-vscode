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
