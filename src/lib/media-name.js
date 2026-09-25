/**
 * Person-based filenames for local media ingest.
 * Shared by the Media tab preview and the server writer. No invented names.
 */

export const INGEST_MAX_BYTES = 25 * 1024 * 1024;
export const INGEST_MAX_REQUEST = 32 * 1024 * 1024;

export const INGEST_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff"]);
export const INGEST_DOC_EXT = new Set([".pdf"]);
export const INGEST_EXT = new Set([...INGEST_IMAGE_EXT, ...INGEST_DOC_EXT]);

export function nameSlug(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function personFileSlug(person) {
  const id = String(person?.id || "").trim();
  const slug = nameSlug([person?.first, person?.surname].filter(Boolean).join(" "));
  return slug ? `${id}_${slug}` : id;
}

export function fileExt(originalName = "", ext = "") {
  const fromExt = String(ext || "").trim();
  const e = fromExt || (String(originalName).match(/(\.[A-Za-z0-9]+)$/) || [])[1] || "";
  return e.toLowerCase();
}

export function documentStem(originalName, caption) {
  const fromCaption = nameSlug(caption);
  if (fromCaption) return fromCaption;
  const base = String(originalName || "").replace(/\\/g, "/").split("/").pop() || "";
  const noExt = base.replace(/\.[A-Za-z0-9]+$/, "");
  return nameSlug(noExt) || "file";
}

export function defaultIngestKind(person, ext) {
  const e = fileExt("", ext);
  if (e === ".pdf" || INGEST_DOC_EXT.has(e)) return "document";
  if ((person?.media || []).length) return "document";
  return "portrait";
}

export function normalizeKind(kind, person, ext) {
  const k = String(kind || "").toLowerCase();
  if (k === "portrait" || k === "document") return k;
  return defaultIngestKind(person, ext);
}

/** Planned relative path (POSIX). Collision suffix is added on write. */
export function destRelative({ person, kind, originalName, caption, ext }) {
  const e = fileExt(originalName, ext);
  const slug = personFileSlug(person);
  if (normalizeKind(kind, person, e) === "portrait") {
    return `sources/portraits/${slug}${e}`;
  }
  return `sources/people/${slug}/${documentStem(originalName, caption)}${e}`;
}
