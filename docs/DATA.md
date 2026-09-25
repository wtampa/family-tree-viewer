# Data

The app reads Gramps XML and GEDCOM. It writes a SQLite database only for **My tree (local)**. Sample trees stay files on disk and are read-only.

## What lives where

| Thing | Path | In git? |
| --- | --- | --- |
| App | this repository | yes |
| Your tree | `{personalRoot}/data/tree.db` | no |
| Frozen Gramps or GEDCOM archive | `{personalRoot}/data/data.gramps` or `data/data.ged` | no — imported once, never written |
| Backups | `{personalRoot}/data/backups/` | no |
| Gramps / GEDCOM exports | `{personalRoot}/data/exports/` (new timestamped files) | no |
| Share packs | `{personalRoot}/data/exports/share-…` or `.cache/share/` | no |
| Preferences | `settings.json`, `links.json`, `hints-state.json`, `media-map.json` | no |
| Sample trees | `sample/` after `npm run fetch-samples` | downloaded `.gramps` / other `.ged` no; three fan GEDCOMs, `catalog.json`, and `portraits.json` yes |

`personalRoot` is a folder you set in `settings.json`. It is the research library, not the app folder.

## SQLite

`server/db.mjs` uses Node's built-in `node:sqlite`. One row per object, the Gramps-shaped record in a `json` column.

Tables: `people`, `families`, `events`, `places`, `citations`, `sources`, `notes`, `media`, `repositories`, `tags`, plus `meta`, `changes` (undo batches), and `history` (the History view).

First open of My tree imports `data/data.gramps` or `data/data.ged` into `tree.db` if the database is missing. Later opens use the database. Export writes a **new** `.gramps` or `.ged`. The importer refuses to overwrite `data.gramps` or `data.ged`.

## Sample files

`sample/catalog.json` lists each demo: id, title, file, license, source URL, and home-person hints. `npm run fetch-samples` downloads the public Gramps and royalty files. The Simpsons, Duck family, and Harry Potter GEDCOMs are already in the repository.

Character portraits are a separate manifest, `sample/<tree>/portraits.json`: person id, local filename, MediaWiki file title, API endpoint, and the page URL the image was taken from. `npm run fetch-portraits` resolves the file through the wiki API and saves it under `sample/<tree>/media/`, which is gitignored.

## Share pack

`POST /api/export-share` (localhost) writes a static folder: `tree.json`, deceased portraits, and a lite viewer. Living people are always redacted in that pack. The pack is not a hosted site and is not committed.

## What is never written

- The original `data.gramps`
- A person the hint engine made up
- Portrait image files into this git repository
