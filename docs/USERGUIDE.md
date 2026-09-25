# Family Tree Viewer — User guide

This is how to run and use the desktop app. New to GEDCOM or Ancestry exports: [START.md](START.md). Project pitch and clone steps: [README](../README.md).

**My tree (local)** is editable (SQLite). Sample Gramps/GEDCOM trees stay read-only. The app never invents people and never overwrites `data.gramps`. It binds **`127.0.0.1` only** — it is not a website you share.

## Install and run

Needs [Node.js](https://nodejs.org/) 22+ (`node:sqlite`).

```bash
git clone https://github.com/wtampa/family-tree-viewer.git
cd family-tree-viewer
npm install
npm run fetch-samples
npm run fetch-portraits
```

**Windows**

1. Double-click `Open Family Tree.bat`.
2. A hidden Node server starts on `http://127.0.0.1:5180/` and a chromeless Edge window opens.
3. Re-clicking the `.bat` reuses the server if it is already up.
4. First run also runs `npm install` and `npm run build`. Later runs rebuild only when `src/` changed.
5. Optional desktop icon: right-click `Put Family Tree on Desktop.ps1` → **Run with PowerShell**.

**Any OS**

```bash
npm run serve
```

Then open `http://127.0.0.1:5180/`. For live reload while editing the app: `npm run dev` (Vite on port 5181, proxies `/api`).

## First run — use a sample tree

The repo does **not** include a private family. After `npm run fetch-samples`, public demos land in `sample/` (the binary `.gramps` / `.ged` files stay gitignored).

1. Open the **Tree** menu in the top bar (or `Ctrl+K` → Trees).
2. Pick **British royal family** or **US Presidents**.
3. Leave **Living hidden** on in the top bar until you know the file.

If a local personal file is present, **My tree (local)** is first in the list. Use a sample when you are learning the views.

| Tree | Good for |
| --- | --- |
| British royal family | Portraits, Fan gold diamonds (pedigree collapse), Hive 3D |
| US Presidents | Compact native Gramps file |
| Ingalls (1880) | Tiny census teaching file |
| royal92 | Large public-domain GEDCOM |
| The Simpsons, Duck family, Harry Potter | Small fan GEDCOMs shipped in the repository. Portraits: `npm run fetch-portraits` |
| Westeros kings | GenoPro public tree, fetched by `fetch-samples` |

Queen portraits and text excerpts are [CC BY-SA 4.0](https://github.com/DavidMStraub/gramps-web-example-tree-queen). Fan-tree pictures are not in the repo. See `sample/README.md`.

You can open a view directly: `http://127.0.0.1:5180/?tree=queen&view=hive`. Add `&person=home` to open the drawer.

## Your own file

Coming from Ancestry with a `.ged`: [START.md](START.md).

The viewer looks for `data/data.gramps` or `data/data.ged` under a folder you name, or a sibling `../data/` file.

1. Copy `settings.example.json` to `settings.json` next to the README. `settings.json` is gitignored.
2. Set `personalRoot` to the folder that **contains** `data/data.gramps` or `data/data.ged` (not the file itself).
3. Restart the app or wait a few seconds — it reloads when the tree file on disk changes.
4. Choose **My tree (local)** from the Tree menu.

Do not put that file, your portraits, or `settings.json` on GitHub.

## Views

Number keys switch views. The current **root** is the person the chart is centered on (chip in the top bar). **Home** is the person kinship and generation numbers are computed from (`H` jumps there).

| Key | View | What it shows |
| --- | --- | --- |
| 1 | Pedigree | Ancestors of the root. Depth slider, siblings, horizontal, compact. A **◇** badge means the same person occupies two ancestor slots (pedigree collapse). |
| 2 | Descendants | Children and further descendants of the root. |
| 3 | Hourglass | Ancestors above and descendants below. |
| 4 | Fan | Radial ancestors. Dashed wedges are unknown parents. A **gold diamond** is pedigree collapse (same person ID in two ahnentafel slots). |
| 5 | Timeline | Lifespans laid out by generation. A **places map** (toggle) plots coordinates already stored on places, plus the root person’s migration path. Trees with no coordinates still get a named path — the app does not geocode. |
| 6 | Hive 3D | The whole tree in generation layers (ancestors up). Portraits sit on the nodes. Brick walls pulse. Toolbar: layout, color, scope, ancestor/descendant sliders, Fit, Root. This is **not** a birth-year 3D plot. |
| 7 | Sources | Evidence table and citations. |
| 8 | Hints | Research dashboard. Pin, mark done, or dismiss — those choices go to `hints-state.json`, not the Gramps file. **Export log** writes pinned hints to markdown in the research folder. |
| 9 | History | Saved edits on My tree. Undo marks a row undone. **Export log** writes `research/edit-log/`. |

**Click a card** to re-root the tree and open the person drawer. **Shift-click** opens details only (root stays put). Unknown parents stay labeled unknown.

![Unknown parents are dashed; gold diamonds mark pedigree collapse.](screenshots/fan.png)

![One view of the royal sample — generations up, living names hidden.](screenshots/hive.png)

![Brick walls and uncited events. No invented cousins.](screenshots/hints.png)

## Person drawer

Click the root chip, or a person, to open the drawer on the right. `Esc` closes it.

**Actions:** Center tree · Pedigree · Fan · Hive · Timeline · Set as home.

**Tabs**

- **Overview** — parents, spouses, children, siblings; how this person relates to home (blood plus **one** marriage hop); **Relate to…** for a second person (can show two paths); a **census-year row** when the person has a US place (US federal plus Florida 1885 / 1935 / 1945); a **places path** (map when the place already has coordinates); evidence bars (0–100).
- **Events** — dates, places, citation dots.
- **Sources** — citations attached to the person and their events.
- **Media** — portraits and files already on the person. On **My tree**, turn on **Edit** to attach a photo from your research folder, set a portrait, or detach.
- **Resources** — extra links you add (stored in `links.json`).
- **Hints** — research items for this person.

![Parents, spouses, children, kinship, census years, and the citation score.](screenshots/drawer.png)

## Living privacy

Sample trees hide living names, dates, notes, and portraits by default (webtrees-style). The top-bar button reads **Living hidden** or **Living shown**.

- Click the button, or `Ctrl+K` → **Unlock living names** / **Hide living names**.
- The choice is **per tree** and lives in gitignored `settings.json`.
- A local personal tree stays **shown** unless you hide it.
- Screenshots and exports you share should stay on a sample with **Living hidden** on.

## Share view (read-only pack)

**Share view** in the top bar (or `Ctrl+K` → Share view) writes a frozen, static folder — `tree.json`, portraits of deceased people, and a lite viewer with **Tree / Fan / Hive** only. Living people are **always** redacted in the pack (names, dates, notes, portraits become `Living`), no matter what the desktop privacy button shows. There is no edit, no unlock, no server API in the pack.

- Personal tree packs land in `{personalRoot}/data/exports/share-YYYYMMDD-HHMMSS/`; sample packs in `.cache/share/`.
- Preview at `http://127.0.0.1:5180/share/` — still localhost only.
- Packs are gitignored. Never commit one.

How to send cousins a private link (email allowlist, Add to Home Screen, what not to upload): **[FAMILY.md](FAMILY.md)**. Implementers: [SHARE.md](dev/SHARE.md).

## Search and shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+K` or `/` | Command palette — people, views, trees, living privacy |
| `1`–`9` | Switch view (9 is History) |
| `H` | Go to the home person |
| `P` | Print |
| `Esc` | Close palette, then close the drawer |
| Top-bar search | Filter / dim (especially useful on Hive). Enter opens the first match. |

In the palette, type a name or a view. **center** re-roots on that person. **relate** opens “how is A related to B” in the drawer.

**PNG** / **SVG** in the top bar export the current chart (SVG is Fan and Timeline). Exports are local downloads — they are not uploaded anywhere.

![Lifespans by generation, plus a places path when the file already has coordinates.](screenshots/timeline.png)

## Sidecar files (gitignored)

The Gramps / GEDCOM file is never written. Anything the app remembers sits next to the README:

| File | What it stores |
| --- | --- |
| `settings.json` | `personalRoot`, active tree, home person per tree, living-privacy per tree |
| `links.json` | Resource URLs you attach to a person |
| `hints-state.json` | Hint id → open / pinned / done / dismissed |
| `media-map.json` | Optional media-id → file path override |
| `.cache/previews.json` | Link preview (Open Graph) cache |

Copy `settings.example.json` to `settings.json` for a blank starting point. Never commit these files or a real family tree.

## Hints (what they will and will not do)

Person confidence is 0–100 from weighted citations. The engine suggests record *classes* (brick wall, missing vitals, uncited events, possible duplicates). It does **not** invent a given name or invent a parent.

On the Hints view you can filter by type, scope (direct ancestors of home vs everyone), and status. **Recompute** runs the engine again after you change the local tree. **Export log** writes the current pinned hints (optionally plus open ancestor hints) to a markdown file in `research/hint-log/` for a local tree, or `.cache/hint-log/` for a sample. `data.gramps` is not touched.

## Editing (My tree only)

1. Pick **My tree (local)**. First load imports `data/data.gramps` into `data/tree.db` if needed.
2. Click **Edit** in the top bar (sample trees have no Edit button).
3. Open a person. Change names, add a parent/spouse/child, add events and notes, attach citations.
4. **Media** tab: **Choose files…** (or drop them on the box). The file is copied immediately — portrait to `sources/portraits/{id}_{name}.jpg`, document/PDF to `sources/people/{id}_{name}/`. The original stays where it was. Nothing is sent to the internet. If copy fails with “unknown api”, close Family Tree and open it again from the desktop icon. You can still pick a file already in the research folder. The first image is the portrait (Hive / chips); **Set as portrait** moves another one to the front. **Detach** removes the link (the copied file stays).
5. **Undo** reverses the last saved change. The **History** view (key `9`) keeps a diary of every save; undo marks a row undone instead of deleting it. **Export log** on History writes markdown to `research/edit-log/`.
6. **Export XML** writes a new timestamped Gramps file under `data/exports/` — it will not overwrite `data.gramps`. **Export GEDCOM** writes a `.ged` you can import on Ancestry (Tree Settings → Import). Ancestry will not receive local photos; add those on Ancestry after import if you need them there.

Leave a given name blank when you do not know it.

Every edit updates `{personalRoot}/data/tree.db`. That SQLite file is the working tree. Ancestry wants the GEDCOM export, not `tree.db`.

## What this is not

- Not a hosted Ancestry / Gramps Web clone. There is no public upload, no accounts, and no public bind.
- Not a place to publish your family. If relatives want to look, they run the app on their own machine. Do not change the listen address to share it.

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| Port already in use | Something is already serving `5180`. Re-click `Open Family Tree.bat` or open `http://127.0.0.1:5180/` directly. |
| Sample trees missing | `npm run fetch-samples` |
| Stale UI after a rebuild | Hard-refresh the window (`Ctrl+F5`) or close the Edge app window and re-open the `.bat`. |
| “My tree” missing | `settings.json` → `personalRoot` must be the folder that contains `data/data.gramps` or `data/tree.db`. |
| Parser errors | `npm run check` (your tree) or `npm run check -- --all` (every sample). |
| Living names you expected to see | Top bar still says **Living hidden**. Unlock it for that tree only. |
