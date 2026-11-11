import { pathName } from "../shared/workspace"

/**
 * The files worth offering as chips: open in the editor, the caret's file first, minus the ones already attached to the
 * prompt above. A file becomes a card when it is attached, so offering it again would ask the user twice.
 */
export function offeredFiles(input: {
  /** The files open in editor tabs, and the one in front. */
  readonly editors: { readonly paths: readonly string[]; readonly active?: string }
  /** The paths of the files attached to the prompt, as the composer resolved them. */
  readonly attached: readonly string[]
  /** The composer's path for an editor path: the same file, spelled as the workspace spells it. */
  readonly resolve: (path: string) => string
}) {
  const attached = new Set(input.attached)

  return ordered(input.editors).filter((path) => !attached.has(input.resolve(path)))
}

/** The file the caret is in first, the rest in tab order. */
export function ordered(input: { readonly paths: readonly string[]; readonly active?: string }) {
  const { active } = input
  if (!active || !input.paths.includes(active)) return input.paths

  return [active, ...input.paths.filter((path) => path !== active)]
}

/** The path as the workspace names it, else its file name: a chip must stay readable. */
export function label(path: string, folders: readonly string[]) {
  const base = path.replace(/\\/g, "/")
  const folder = folders.map(folderName).find((folder) => base.startsWith(`${folder}/`))

  return folder ? base.slice(folder.length + 1) : pathName(base)
}

function folderName(folder: string) {
  return folder.replace(/\\/g, "/").replace(/\/+$/, "")
}
