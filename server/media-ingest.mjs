/**
 * Localhost media ingest: copy a chosen file under the research folder, then attach.
 * Writes only under {personalRoot}/sources/…. Never the app repo. Never data.gramps.
 */
import fs from "node:fs";
import path from "node:path";
import {
  INGEST_EXT,
  INGEST_MAX_BYTES,
  INGEST_MAX_REQUEST,
  destRelative,
  fileExt,
  normalizeKind,
} from "../src/lib/media-name.js";

export {
  INGEST_EXT,
  INGEST_MAX_BYTES,
  INGEST_MAX_REQUEST,
  destRelative,
  personFileSlug,
} from "../src/lib/media-name.js";

export function assertInside(root, dest) {
  const r = path.resolve(root);
  const f = path.resolve(dest);
  if (f === r || f.toLowerCase().startsWith((r + path.sep).toLowerCase())) return;
  throw new Error("ingest path escapes the research folder");
}

export function assertAllowedExt(ext) {
  const e = fileExt("", ext);
  if (!INGEST_EXT.has(e)) throw new Error(`file type not allowed: ${e || "(none)"}`);
  return e;
}

function uniqueAbs(absPath) {
  if (!fs.existsSync(absPath)) return absPath;
  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const stem = path.basename(absPath, ext);
  for (let n = 2; n < 10000; n += 1) {
    const cand = path.join(dir, `${stem}-${n}${ext}`);
    if (!fs.existsSync(cand)) return cand;
  }
  throw new Error("too many name collisions");
}

export function destPath({ personalRoot, person, kind, originalName, caption, ext }) {
  const e = assertAllowedExt(fileExt(originalName, ext));
  const rel = destRelative({ person, kind, originalName, caption, ext: e });
  if (rel.includes("..") || path.isAbsolute(rel)) throw new Error("invalid ingest destination");
  if (!rel.startsWith("sources/portraits/") && !rel.startsWith("sources/people/")) {
    throw new Error("ingest writes only under sources/portraits or sources/people");
  }
  const abs = uniqueAbs(path.join(personalRoot, rel.split("/").join(path.sep)));
  assertInside(personalRoot, abs);
  const outRel = path.relative(personalRoot, abs).split(path.sep).join("/");
  return { abs, relative: outRel, ext: e };
}

export function ingestFile({ personalRoot, person, kind, originalName, caption, ext, bytes, sourcePath }) {
  if (!personalRoot) throw new Error("personalRoot required");
  const payload = bytes || (sourcePath ? fs.readFileSync(sourcePath) : null);
  if (!payload || !payload.length) throw new Error("file data required");
  if (payload.length > INGEST_MAX_BYTES) throw new Error("file too large (25 MB limit)");
  const dest = destPath({
    personalRoot,
    person,
    kind: normalizeKind(kind, person, fileExt(originalName, ext)),
    originalName,
    caption,
    ext,
  });
  fs.mkdirSync(path.dirname(dest.abs), { recursive: true });
  fs.writeFileSync(dest.abs, payload);
  return dest;
}

function indexOfBuf(buf, needle, start = 0) {
  return buf.indexOf(needle, start);
}

function splitBuffer(buf, sep) {
  const out = [];
  let i = 0;
  while (i <= buf.length) {
    const idx = indexOfBuf(buf, sep, i);
    if (idx < 0) {
      out.push(buf.subarray(i));
      break;
    }
    out.push(buf.subarray(i, idx));
    i = idx + sep.length;
  }
  return out;
}

export function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) throw new Error("multipart boundary missing");
  const boundary = Buffer.from(`--${String(m[1] || m[2]).trim()}`);
  const chunks = splitBuffer(buffer, boundary);
  const fields = {};
  let file = null;
  for (const chunk of chunks) {
    if (!chunk.length) continue;
    if (chunk[0] === 0x2d && chunk[1] === 0x2d) continue;
    let part = chunk;
    if (part[0] === 13 && part[1] === 10) part = part.subarray(2);
    const headerEnd = indexOfBuf(part, Buffer.from("\r\n\r\n"));
    if (headerEnd < 0) continue;
    const header = part.subarray(0, headerEnd).toString("utf8");
    let body = part.subarray(headerEnd + 4);
    if (body.length >= 2 && body[body.length - 2] === 13 && body[body.length - 1] === 10) {
      body = body.subarray(0, -2);
    }
    const nameM = /name="([^"]+)"/i.exec(header);
    if (!nameM) continue;
    const fileM = /filename="([^"]*)"/i.exec(header);
    if (fileM) {
      file = {
        name: path.basename(fileM[1] || "file"),
        mime: (/content-type:\s*([^\r\n]+)/i.exec(header) || [])[1] || "",
        data: body,
      };
    } else {
      fields[nameM[1]] = body.toString("utf8");
    }
  }
  return { fields, file };
}

export function parseIngestBody(buf, contentType) {
  const ct = String(contentType || "");
  if (ct.includes("multipart/form-data")) {
    const parsed = parseMultipart(buf, ct);
    if (!parsed.file?.data?.length) throw new Error("file required");
    return {
      personId: String(parsed.fields.personId || "").trim(),
      kind: String(parsed.fields.kind || "").trim(),
      caption: String(parsed.fields.caption || "").trim(),
      name: parsed.file.name || "file",
      mime: parsed.file.mime || "",
      bytes: parsed.file.data,
    };
  }
  const json = JSON.parse(buf.toString("utf8") || "{}");
  const data = json.data;
  if (!data) throw new Error("file data required");
  return {
    personId: String(json.personId || "").trim(),
    kind: String(json.kind || "").trim(),
    caption: String(json.caption || "").trim(),
    name: json.name || "file",
    mime: json.mime || "",
    bytes: Buffer.from(String(data), "base64"),
  };
}

export async function readIngestRequest(req) {
  const len = Number(req.headers["content-length"] || 0);
  if (len && len > INGEST_MAX_REQUEST) throw new Error("request too large (25 MB limit)");
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > INGEST_MAX_REQUEST) throw new Error("request too large (25 MB limit)");
    chunks.push(c);
  }
  return parseIngestBody(Buffer.concat(chunks), req.headers["content-type"] || "");
}
