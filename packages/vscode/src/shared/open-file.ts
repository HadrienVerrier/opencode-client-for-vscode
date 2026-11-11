/** A place where the editor can look for a file the GUI names. */
export type OpenCandidate =
  /** The path relative to the workspace folder at this index. */
  | { readonly folder: number; readonly relative: string }
  /** The path as given, when it is absolute. */
  | { readonly absolute: string }

/**
 * Where to look for a file the GUI names, in order. The opencode server and the editor can be
 * different machines, and a session can sit in a subdirectory of the folder the editor has open, so
 * the path is tried relative to the session's directory inside each workspace folder, then directly
 * under each folder, then as the absolute path it had on the server.
 */
export function openCandidates(
  input: { readonly root: string; readonly path: string },
  folders: readonly string[],
): OpenCandidate[] {
  const path = normalize(input.path)
  const root = normalize(input.root)
  const absolute = path.startsWith("/") || /^[a-z]:\//i.test(path)
  const relative = absolute ? relativeTo(path, root) : path

  if (!relative) return absolute ? [{ absolute: path }] : []

  const seen = new Set<string>()
  const candidates: OpenCandidate[] = []
  const add = (folder: number, value: string) => {
    if (!value || seen.has(`${folder}:${value}`)) return
    seen.add(`${folder}:${value}`)
    candidates.push({ folder, relative: value })
  }

  folders.forEach((folder, index) => {
    const placed = relativeTo(root, folder)
    if (placed) add(index, `${placed}/${relative}`)
    add(index, relative)
  })

  return absolute ? [...candidates, { absolute: path }] : candidates
}

/**
 * Links the VS Code extension opens, rather than the GUI's own file panel: a path, never a URL or a
 * custom protocol, and an absolute one only when the editor has that folder open.
 */
export function isEditorLink(href: string, folders: readonly string[]) {
  const path = href.trim()
  if (!path) return false
  // `https:`, `file:` and `skill://` stay with the file plugin, which resolves them itself.
  if (/^[a-z][a-z0-9+.-]+:/i.test(path)) return false
  if (!/[\\/]/.test(path) && !/\.[a-z0-9]{1,8}(?=$|[:#?])/i.test(path)) return false
  const absolute = path.startsWith("/") || /^[a-z]:[\\/]/i.test(path)
  return !absolute || folders.some((folder) => relativeTo(path, folder) !== undefined)
}

/** Whether a path is a folder or sits inside it, on either separator; Windows drives compare case-insensitively. */
export function insideFolder(path: string, folder: string) {
  return relativeTo(path, folder) !== undefined
}

/**
 * Glob for the editor's index when no exact path matched: a link written from a subdirectory names
 * only the tail of the file (`config/application.php` for `core/config/application.php`), the same
 * suffix match the GUI's file panel does. Glob metacharacters in the path are escaped.
 */
export function suffixPattern(input: { readonly root: string; readonly path: string }) {
  const path = normalize(input.path)
  const root = normalize(input.root)
  const absolute = path.startsWith("/") || /^[a-z]:\//i.test(path)
  const relative = absolute ? relativeTo(path, root) : path
  if (relative === undefined) return undefined
  return `**/${relative.replace(/^\/+/, "").replace(/[*?[\]{}]/g, "\\$&")}`
}

/** The path under `parent`, `""` when they are the same, or undefined when it sits elsewhere. */
function relativeTo(path: string, parent: string) {
  const base = normalize(parent)
  if (!base) return undefined

  const subject = fold(normalize(path), base)
  const prefix = fold(base, base)
  if (subject === prefix) return ""
  if (!subject.startsWith(`${prefix}/`)) return undefined
  return normalize(path).slice(base.length + 1)
}

function normalize(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "")
}

/** Folds case only on Windows drive paths; elsewhere two paths that differ only in case are different. */
function fold(value: string, other: string) {
  return /^[a-z]:\//i.test(value) || /^[a-z]:\//i.test(other) ? value.toLowerCase() : value
}
