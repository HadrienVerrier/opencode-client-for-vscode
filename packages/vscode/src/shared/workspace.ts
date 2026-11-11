/** Where a chat runs in an editor window, and what its project is called there. */
export type WorkspaceContext = {
  /** Absolute, in the editor's own path separator: the server reads it. */
  readonly directory: string
  /** What the project is called in the GUI. */
  readonly name: string
}

/**
 * The chat's directory and project name for an editor window.
 *
 * One folder is that folder. Several folders have no directory of their own, so the chat runs in their common ancestor,
 * named after the workspace: a `.code-workspace` carries no name of its own, so it is the name it declares, else its file
 * name. A window without a folder runs in the active file's folder, which is the nearest project there is. `undefined`
 * when the window knows nothing better than the server's own location.
 */
export function workspaceContext(input: {
  /** The window's folders, absolute. */
  readonly folders: readonly string[]
  /** The `.code-workspace` the window was opened from, when it has one, and its text. */
  readonly file?: { readonly path: string; readonly content?: string }
  /** VS Code's name for the window: "repo", or "repo (Workspace)" for a saved or untitled multi-root window. */
  readonly title?: string
  /** The file in the active editor, for a window without a folder. */
  readonly activeFile?: string
}): WorkspaceContext | undefined {
  if (input.folders.length === 0) {
    const directory = input.activeFile ? parent(input.activeFile) : undefined

    return directory ? { directory, name: pathName(directory) } : undefined
  }

  const [only] = input.folders
  if (input.folders.length === 1 && only) return { directory: only, name: pathName(only) }

  const ancestor = commonAncestor(input.folders)
  const directory = first([ancestor, input.file ? parent(input.file.path) : undefined, ...input.folders], isUsable)

  if (!directory) return undefined

  return {
    directory,
    name: declaredName(input.file?.content) ?? fileName(input.file?.path) ?? title(input.title) ?? pathName(directory),
  }
}

/** An ancestor that is only a filesystem root names no project: the agent would run above every folder. */
function isUsable(path: string | undefined): path is string {
  if (!path) return false

  return path !== "/" && path !== "\\" && !/^[A-Za-z]:[\\/]?$/.test(path)
}

function first<T>(values: readonly (T | undefined)[], accept: (value: T) => boolean): T | undefined {
  return values.find((value): value is T => value !== undefined && accept(value))
}

/** The name a workspace declares for itself, which VS Code ignores but users write anyway. */
function declaredName(content: string | undefined) {
  if (!content) return undefined

  const parsed = parse(content)
  const name = parsed && typeof parsed === "object" ? (parsed as { name?: unknown }).name : undefined

  return typeof name === "string" && name.trim() ? name.trim() : undefined
}

function parse(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return undefined
  }
}

function fileName(path: string | undefined) {
  if (!path) return undefined

  const name = pathName(path).replace(/\.code-workspace$/i, "")

  return name || undefined
}

/** "proj (Workspace)" is how VS Code names a multi-root window it has no file for. */
function title(value: string | undefined) {
  const name = value?.replace(/\s*\((Workspace|Workspace Folder)\)$/i, "").trim()

  return name || undefined
}

/** The deepest directory that contains every folder, in their own path separator. */
function commonAncestor(folders: readonly string[]) {
  let ancestor = folders[0]!.replace(/[\\/]+$/, "")

  while (!folders.every((folder) => isInside(folder, ancestor))) {
    const up = parent(ancestor)
    if (!up) return root(ancestor)
    ancestor = up
  }

  return ancestor
}

function isInside(path: string, ancestor: string) {
  if (path === ancestor) return true
  if (!path.startsWith(ancestor)) return false

  const separator = path.charAt(ancestor.length)

  return separator === "/" || separator === "\\"
}

function root(path: string) {
  const drive = /^[A-Za-z]:/.exec(path)

  return drive ? `${drive[0]}${path.includes("\\") ? "\\" : "/"}` : "/"
}

function parent(path: string) {
  const trimmed = path.replace(/[\\/]+$/, "")
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))

  if (cut < 0) return undefined

  const head = trimmed.slice(0, cut)
  if (head === "") return trimmed.slice(0, 1)
  // A drive is a root with its separator, not a directory of its own.
  if (/^[A-Za-z]:$/.test(head)) return `${head}${trimmed.charAt(cut)}`

  return head
}

/** The last segment of a path, in either separator. */
export function pathName(path: string) {
  const trimmed = path.replace(/[\\/]+$/, "")
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))

  return cut < 0 ? trimmed : trimmed.slice(cut + 1)
}
