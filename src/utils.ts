export function basename(path: string): string {
  const norm = path.replace(/\\/g, "/");
  return norm.slice(norm.lastIndexOf("/") + 1) || norm;
}

export function dirname(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx <= 0 ? norm : norm.slice(0, idx);
}

export function relativeTo(root: string, target: string): string {
  const r = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const t = target.replace(/\\/g, "/");
  if (t.toLowerCase().startsWith(r.toLowerCase() + "/")) {
    return t.slice(r.length + 1);
  }
  return t;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

/** CodeMirror stores lines as `\n`; keep the store in the same shape. */
export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

/** Resolve a relative URL against the directory containing `baseFile`. */
export function resolveRelative(baseFile: string, rel: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel)) {
    return rel;
  }
  // Network-path references (`//host/...`) and UNC/device prefixes are never
  // local document paths. Returning an empty value keeps callers from passing
  // them to the filesystem or the custom protocol.
  if (/^[/\\]{2}/.test(rel)) {
    return "";
  }
  // Windows verbatim paths (`\\?\C:\…`) are absolute but must lose the prefix.
  const base = baseFile.replace(/^[/\\]{2}\?[/\\]/, "").replace(/\\/g, "/");
  const baseDir = dirname(base);
  const target = rel.replace(/\\/g, "/").replace(/^[/\\]{2}\?[/\\]/, "");
  const isAbsolute = /^[a-zA-Z]:\//.test(target) || target.startsWith("/");
  const parts = isAbsolute
    ? target.split("/")
    : `${baseDir}/${target}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (out.length > 1) out.pop();
      continue;
    }
    out.push(part);
  }
  let result = out.join("/");
  if (isAbsolute && /^[a-zA-Z]:$/.test(out[0] ?? "")) {
    result = `${out[0]}/${out.slice(1).join("/")}`;
  }
  return result;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Extract an ordered list of ATX headings (outside fenced code blocks). */
export function parseHeadings(content: string) {
  const headings: { level: number; text: string; line: number }[] = [];
  let inFence = false;
  content.split("\n").forEach((raw, index) => {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].replace(/[#*_`~]/g, "").trim(),
        line: index,
      });
    }
  });
  return headings;
}
