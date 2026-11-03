/** A map's name (its folder's or archive file's) and the folder it is in, as the welcome screen lists them. */
export function placeOf(path: string): { name: string; folder: string } {
  const trimmed = path.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (cut < 0) return { name: trimmed, folder: "" };
  const folder = trimmed.slice(0, cut);
  // A drive's root keeps its slash: D:\ rather than D:.
  return {
    name: trimmed.slice(cut + 1),
    folder: folder.endsWith(":") ? trimmed.slice(0, cut + 1) : folder,
  };
}
