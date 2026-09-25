# Family Tree — share lite (read-only)

Point a new chat at this file: `docs/dev/SHARE.md`

Implement from here. Do **not** re-scaffold. Do **not** edit a personal `data.gramps`. Do **not** invent names. Do **not** bind `0.0.0.0`. Do **not** add a public/cloud upload API. Do **not** put `tree.db`, `data.gramps`, or a real family snapshot on GitHub.

App overview and daily-driver work stay in [NEXT.md](../../NEXT.md). Publish rules stay in [QAQC.md](../../QAQC.md). This file is **only** the share-lite product.

## Why this exists

Relatives (~12 people) should **click a tree** on a phone. They will not install Node, Git, or a desktop package. They do not need Edit, Hints, History, Sources, or media ingest.

The honest product is **not** this Node server on the internet. It is a **frozen, living-redacted static pack** (Tree / Fan / Hive) exported from the localhost app. Hosting that folder behind a gate is a later slice. First slice stays on `127.0.0.1`.

## What already exists (reuse it)

- Vite + React 18, Node server `127.0.0.1:5180` ([server.mjs](../../server.mjs)).
- Living redaction in [server/privacy.mjs](../../server/privacy.mjs) (`redactModel`, `redactMediaResolved`, `redactCensus`, `redactLinks`). Names/dates/notes/media of likely-living people become **Living**; relationship **slots stay**.
- Tree JSON the client already understands: `treePayload()` in [server.mjs](../../server.mjs) + [src/lib/model.js](../../src/lib/model.js) `TreeModel`.
- Views to reuse: [src/views/ChartView.jsx](../../src/views/ChartView.jsx) (pedigree / descendants / hourglass), [src/views/FanView.jsx](../../src/views/FanView.jsx), [src/views/HiveView.jsx](../../src/views/HiveView.jsx).
- Portraits read `model.portrait(pid)` → `mediaResolved[id].url` ([src/components/Portrait.jsx](../../src/components/Portrait.jsx)).
- Timestamped exports already go under `{personalRoot}/data/exports/` ([server/db.mjs](../../server/db.mjs) `personalExportDir`). Gramps/GEDCOM export pattern: [server/gramps-export.mjs](../../server/gramps-export.mjs), [server/gedcom-export.mjs](../../server/gedcom-export.mjs).
- Sample trees for QA: **British royal (`queen`)** after `npm run fetch-samples`. Never QA a share pack by committing the personal tree.

**Personal tree size (order of magnitude):** ~229 people, `/api/tree` well under 1 MB. Fine as a static `tree.json`.

## Product rules (lock these)

| Rule | Meaning |
|---|---|
| Snapshot, not live server | Export writes a **folder of static files**. Relatives never talk to `server.mjs`. |
| Living baked off | Pack is built with hide-living **forced on**. No **Living shown** button. No `POST /api/settings`. |
| Read-only | No edit, undo, ingest, `/api/open`, hints, history, links editor, file browser. |
| Slots stay | Keep `redactModel` behavior: living people remain nodes labeled `Living`. Do not drop them in slice 1 (holes in the fan). Optional later flag: omit living nodes. |
| Localhost until asked | Slice 1: export + preview on `127.0.0.1:5180`. Do not deploy. Do not add Cloudflare/Netlify code that uploads the family file. |
| Pack stays off git | Share folders are gitignored. Same rule as `tree.db`. |
| `127.0.0.1` only | [server.mjs](../../server.mjs) `HOST` stays `"127.0.0.1"`. QAQC **FAIL** if that changes. |
| No family names in reports | Selftests use the Ada fixture / `queen` sample. Do not print personal-tree names in check output or commit messages. |

A shared website password is **not** slice 1. When hosting happens, prefer an **email allowlist** (Cloudflare Access) over one family password in a group text. Client-side “type the password” in JS is forbidden (the JSON is still downloadable).

## Suggested first chat slice (do this)

**Localhost share pack + lite viewer.** Click **Share view** on the desktop app, get a folder, and open it in the same Edge window (or `/share/`). Three buttons: Tree / Fan / Hive. Tap a person → short card. Living people are already `Living`.

### 1. Export a pack (`POST /api/export-share`)

New module: `server/share-export.mjs`. Wire it in [server.mjs](../../server.mjs) next to the other export routes.

**Always** run `redactModel` + `redactMediaResolved` + `redactCensus` + `redactLinks` as if `hideLiving` were true, even if the desktop app currently shows living names.

Write a **new** timestamped folder (never overwrite):

- Personal tree: `{personalRoot}/data/exports/share-YYYYMMDD-HHMMSS/`
- Sample / no research folder: `{APP_ROOT}/.cache/share/share-YYYYMMDD-HHMMSS/`

Refuse to write inside the app `src/`, `dist/`, or git-tracked paths except `.cache/share/`. Reuse the “assert path inside exports / cache” pattern from [server/gramps-export.mjs](../../server/gramps-export.mjs) `assertSafeExportPath`.

**Folder layout:**

```
share-YYYYMMDD-HHMMSS/
  index.html          (lite viewer)
  assets/             (hashed JS/CSS from the share Vite entry)
  tree.json           (payload TreeModel already accepts)
  media/              (copied portraits of *dead* people only)
  share-meta.json     (treeId, exportedAt, personCount, livingRedacted, no names)
```

**`tree.json` is `treePayload()`-shaped**, with these changes:

- `settings.hideLiving` = `true`
- `settings.editable` = `false`
- `settings.canUndo` = `false`
- **Omit** `settings.projectRoot`, `settings.grampsFile`, `settings.store`
- **Omit** `hintBadge`, hints, census optional (include only if cheap; drawer slice-1 card does not need it)
- `delete model.handleToId` (already done in `treePayload`)
- `mediaResolved[id].url` = **relative** `media/<safeFile>` — not `/api/media/…`
- Do not copy a media file if `redactMediaResolved` dropped it or `mediaTouchesLiving` is true
- Allowlisted image types only (same spirit as ingest: jpg/jpeg/png/webp/gif). Skip PDF in slice 1
- `share-meta.json` must not contain given names or the personal home person id

Return JSON `{ ok, path, relative, personCount, livingRedacted }` — paths only, no names.

### 2. Lite viewer (second Vite entry)

Do **not** load [src/App.jsx](../../src/App.jsx). New entry:

- `share.html` at repo root (or `src/share.html` if you keep the root `index.html` as the desktop app)
- `src/share/main.jsx` + `src/share/ShareApp.jsx`
- Reuse `TreeModel`, `ChartView`, `FanView`, `HiveView`, `Portrait`
- New slim card `src/share/ShareCard.jsx`: name, years, parents / spouses / children chips (Living stays Living). No Edit, Media attach, Hints, Resources, census row, places map
- Load data with `fetch("./tree.json")` — **no** [src/lib/api.js](../../src/lib/api.js)
- Views: **pedigree** (Tree), **fan**, **hive** only. Skip descendants/hourglass/timeline/sources/hints/history in slice 1
- Big phone-friendly toggle (three controls). Default view: pedigree
- No command palette, no tree picker, no living-privacy button, no export Gramps/GEDCOM
- `localStorage` keys must be namespaced `fts:` (not `ftv:`) so the desktop app and the pack do not fight
- Hive: keep generation layers (not birth-year). On a small screen it may be heavy; still ship it. If WebGL fails, show a one-line fallback “Hive needs a newer browser — use Tree or Fan.” Do not crash the other views

Vite: add a second input so `npm run build` emits both `dist/index.html` (desktop) and `dist/share.html` (or `dist/share/index.html`). The exporter **copies the share build** into each pack next to `tree.json` (rewrite asset paths so they work as `index.html` + `./tree.json` from the pack root). Relative base (`base: "./"`) for the share entry only — do not break the desktop app’s `/` assets.

### 3. Desktop preview (still localhost)

- `GET /share/` (and static files under it) serves the **latest** pack folder. `HOST` stays `127.0.0.1`.
- Top bar / command palette: **Share view** (next to existing Export GEDCOM). Calls `POST /api/export-share`, toasts the folder path, then opens `/share/` in the same window or a new Edge `--app` only if that is already how exports work. Prefer in-app: navigate to `/share/` or `window.open("http://127.0.0.1:5180/share/")`.
- Do not start a second server. Do not bind another port to `0.0.0.0`.

### 4. Selftest

`server/share-export-selftest.mjs`, hooked from [server/check.mjs](../../server/check.mjs) like the other selftests.

Use the **Ada fixture** in [server/store-selftest.mjs](../../server/store-selftest.mjs) (or a tiny inline copy). Add one **undated, recent-birth living** person (given name can be `Pat` — not a real relative). Assert:

- Pack directory is under `.cache/` or `data/exports/`
- `tree.json` parses; `TreeModel` can construct
- Living person display name is `Living` / `privateLiving`
- That living given name does **not** appear in `tree.json` or any copied media filename
- Dead Ada still has her name
- `settings.editable` is false; no `projectRoot`
- Every `mediaResolved` url is relative and the file exists
- No `data.gramps` is written

`npm run check` must stay green. Do not log personal-tree names.

### 5. Gitignore + docs

Add to [.gitignore](../../.gitignore):

```
.cache/share/
```

Do **not** gitignore `{personalRoot}/data/exports/` (that folder is outside this repo).

One short subsection in [docs/USERGUIDE.md](../USERGUIDE.md): **Share view** — localhost pack, living baked off, not a website yet. Point implementers at this file, not a rewrite of the user guide.

[QAQC.md](../../QAQC.md): add a row — share export forces redaction; pack off git; `HOST` still `127.0.0.1`; `/share/` is localhost-only.

## Verify (slice 1)

Prefer code-only. This repo’s Cursor browser calls hang (`AGENTS.md`).

1. `npm run check` (selftest + default tree).
2. Restart `Open Family Tree.bat` (so `/api/export-share` is live).
3. Switch to **British royal family** (sample). **Share view**. Confirm a folder under `.cache/share/share-…`.
4. Open `http://127.0.0.1:5180/share/` — Tree / Fan / Hive, click a person, card opens. No Edit, no Living toggle.
5. Optional: My tree — pack lands in `{personalRoot}/data/exports/share-…`. Confirm `tree.json` has `"Living"` and not a living relative’s given name (do not paste those names into chat or commits).
6. `git status` — pack folders untracked.

## Later (not this slice unless you ask)

Slice 1 (localhost pack) and the phone CSS pass are done. Cousin handout + Cloudflare lock-then-upload click path: **[docs/FAMILY.md](../FAMILY.md)**. Create the Cloudflare account and lock Access **before** the first upload. No in-app upload API. No Git-connected Pages.

Remaining only if asked:

1. Optional export flag: **omit living nodes** entirely (holes in the fan).
2. Re-export when the tree changes (new timestamped folder; old packs stay), then replace the same Pages project.

## Skip (do not start)

- Capacitor / App Store / Play Store
- Electron / Tauri / bundled Node for relatives
- Hosting `server.mjs` or binding `0.0.0.0`
- HTTP Basic Auth or a password baked into `index.html`
- Client-side password that “decrypts” `tree.json` in the browser (security theater)
- Putting a share pack, `tree.db`, or `settings.json` on GitHub
- Multi-tenant “each cousin uploads their GEDCOM”
- Unlock-living in the pack
- DNA, FamilySearch/Ancestry sync, AI-proposed relatives
- Rewriting Hive to birth-year (Family Plot)

## Files you will likely touch

| File | Why |
|---|---|
| [server/share-export.mjs](../../server/share-export.mjs) | **New.** Build redacted `tree.json` + copy media + copy share UI |
| [server/share-export-selftest.mjs](../../server/share-export-selftest.mjs) | **New.** Ada + living fixture |
| [server.mjs](../../server.mjs) | `POST /api/export-share`, static `/share/` |
| [server/check.mjs](../../server/check.mjs) | Hook selftest |
| [server/privacy.mjs](../../server/privacy.mjs) | Reuse; do not weaken |
| [vite.config.js](../../vite.config.js) | Second build entry; share `base: "./"` |
| [package.json](../../package.json) | Only if you add a `build:share` script (optional; one `vite build` is better) |
| [src/share/main.jsx](../../src/share/main.jsx), [src/share/ShareApp.jsx](../../src/share/ShareApp.jsx), [src/share/ShareCard.jsx](../../src/share/ShareCard.jsx) | **New.** Lite app |
| `share.html` | **New.** Share entry HTML |
| [src/lib/api.js](../../src/lib/api.js) | `exportShare: () => post("/api/export-share")` for the desktop button only |
| [src/App.jsx](../../src/App.jsx), [src/components/CommandPalette.jsx](../../src/components/CommandPalette.jsx) | **Share view** action |
| [src/views/ChartView.jsx](../../src/views/ChartView.jsx), [FanView.jsx](../../src/views/FanView.jsx), [HiveView.jsx](../../src/views/HiveView.jsx) | Reuse; tweak props only if the lite shell needs it |
| [.gitignore](../../.gitignore) | `.cache/share/` |
| [docs/USERGUIDE.md](../USERGUIDE.md), [QAQC.md](../../QAQC.md) | Short share section + FAIL row |

Do not copy research markdown into `notes/`. Do not commit the pack.

## Done when

- `npm run check` includes a green share selftest
- Sample **Share view** produces a folder that opens at `http://127.0.0.1:5180/share/`
- Tree / Fan / Hive work; person card works; no edit; no living unlock
- Living given names from the fixture are absent from `tree.json`
- `HOST` is still `127.0.0.1`
- `git status` shows no share pack, no `settings.json`, no `*.db`

Hosting and “text a URL to cousins” wait for a later chat. Point that chat at this file’s **Later** section after slice 1 is done.
