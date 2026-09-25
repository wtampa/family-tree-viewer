# Family Tree — next ideas

Point a new chat at this file: `NEXT.md`

Share-lite (read-only Tree / Fan / Hive for relatives): `docs/dev/SHARE.md`

Implement from here. Do **not** re-scaffold. Do **not** edit a personal `data.gramps`. Do **not** invent names.

## What already exists

Vite + React 18, Node server `127.0.0.1:5180`, Edge `--app` window (`Open Family Tree.bat`). **My tree (local)** is a writable SQLite database at `{personalRoot}/data/tree.db` (imported once from `data.gramps`, which is never written). Sample `.gramps` / `.ged` trees stay read-only. Sidecars: `settings.json`, `links.json`, `hints-state.json`, `media-map.json`. Versioned `tree.db` backups in `data/backups/`. Timestamped Gramps XML exports in `data/exports/`.

Views: Pedigree / Descendants / Hourglass (`family-chart`), Fan, Timeline (lifespans + places map / migration path), Hive 3D (generation layers, portraits, brick walls pulse), Sources, Hints, History. Person drawer, command palette, hover previews (OG + local PDF thumbs). **Edit** on My tree: names, gender, events, notes, add parent/spouse/child, sources/citations, attach/detach/set portrait (Choose files copies into `sources/portraits` or `sources/people` on this machine), undo. Hint engine never invents names. Kinship is blood + **one** marriage hop. A↔B multi-path + census checklist. Gold **◇ diamonds** on Fan / Pedigree / Hive when the **same person ID** occupies two ahnentafel slots — duplicate *records* (two IDs) are not a collapse; do not merge them. Drawer Overview has a **census-year row** (US federal + Florida 1885/1935/1945) from first US place through death, plus a **places path** (map when the tree already has coordinates). Search / hints index **name aliases** (accents, particles, two surnames) without rewriting the stored display name. **Export log** on Hints writes pinned (optionally open ancestor) hints to `research/hint-log/` — never the `.gramps` file. History view lists every saved edit; **Export log** there writes `research/edit-log/`.

Run: desktop icon, or `npm run check -- --all` then `Open Family Tree.bat`. Hard-refresh after a rebuild. `npm run fetch-samples` for the public demo trees.

**Public pitch:** localhost genealogy app — generation hive, honest hints, and core editing. Imports Gramps/GEDCOM; exports new Gramps XML and GEDCOM (for Ancestry import). Not a hosted upload site. Not Family Plot (birth-year 3D).

Closest elsewhere: [Family Plot](https://github.com/oh-kay-blanket/family-plot) (3D, birth-year axis, GEDCOM, edits), [Topola](https://github.com/PeWu/topola-viewer) (2D Gramps overlay), [Gramps Web](https://github.com/gramps-project/gramps-web), closed-source GenSmarts.

---

## Done recently

### Local media ingest — done 2026-09-20

Media tab **Choose files** / drag-drop copies into `{personalRoot}/sources/portraits` or `sources/people` with `{id}_{slug}` names (`POST /api/ingest-media`, localhost only, then existing attach). Undo detaches the tree link; the copied file stays.

### Person media, GEDCOM export, edit history — done 2026-09-20

Media tab can attach/detach/set portrait from files already under the research folders (`POST /api/edit/media`). `POST /api/export-gedcom` writes timestamped `.ged` next to Gramps XML. Append-only `history` table + History view (key 9) + `research/edit-log/` export. Undo still pops the last `changes` batch and marks the history row undone.

### SQLite primary store + core editing — done 2026-09-19

`server/db.mjs` (`node:sqlite`), one-time import from `data.gramps` → `data/tree.db`, `server/gramps-export.mjs` (refuses `data.gramps`), round-trip + edit/undo selftest in `npm run check`, backups on server start, `POST /api/edit/*` + `/api/undo` + `/api/export-gramps`. Edit toggle on My tree only.

---

## GitHub (chosen path) — no hosted uploads

Published: https://github.com/wtampa/family-tree-viewer — MIT, localhost only. The Simpsons, Duck family, and Harry Potter GEDCOMs are in the repository. Character portraits are fetched locally (`npm run fetch-portraits`) and are not committed.

Do not commit sidecars or any real family file. Do not add a public/cloud upload API or bind `0.0.0.0`. Localhost ingest under `{personalRoot}/sources/…` is allowed.

---

## Skip (do not start)

- DNA chromosome browser
- FamilySearch / Ancestry account sync
- AI chat that proposes relatives
- Writing `data.gramps` in place
- Publishing the work hive / `board.json`
- Putting a real `data.gramps` or `tree.db` on GitHub
- Multi-tenant hosting / accepting other people’s trees

## Later (not this week)

- Share-lite pack for relatives is implemented (localhost export + phone CSS). Host one pack behind Cloudflare Access using [docs/FAMILY.md](docs/FAMILY.md). Do not host `server.mjs`.
- Merge / dedupe (two IDs that are the same person)
- Place hierarchy editor
- Media manager (gallery, tags, crop — person attach is done)
- Reports

---

## Suggested first chat slice

Daily-driver: pick **My tree (local)**, turn on **Edit**, **Choose files** on a person’s Media tab (or drop a photo), check the dest path, then History. **Export GEDCOM** if you want to import on Ancestry. Then first public commit only after [QAQC.md](QAQC.md). Restart the desktop app after this slice so `/api/ingest-media` is live.

## Files you will likely touch (next slice)

- [QAQC.md](QAQC.md) publish pass, then first commit of this folder only

## Rules to honor

- Never write `data.gramps`. SQLite is the store; exports are new timestamped files.
- Never invent given names. Unknown parents stay unknown.
- Prefer primary sources over Ancestry member trees.
- Port 5180. Hive 3D stays generation-layered, not birth-year (that is Family Plot’s trick).
