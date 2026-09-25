# Contributing

Family Tree Viewer is a localhost research desk. Pull requests are welcome for bug fixes, views, and docs.

## Public rules

- Do not write `data.gramps` in place. SQLite is the store. Exports are new timestamped files.
- Do not invent given names. Unknown parents stay unknown.
- Bind `127.0.0.1` only. Do not add a public upload API or bind `0.0.0.0`.
- Do not commit sidecars (`settings.json`, `links.json`, `hints-state.json`, `media-map.json`), `notes/`, `*.db`, or a real family `.gramps` / `.ged`.
- Before a pull request, run `npm run check -- --all`.

Local Cursor notes live in `AGENTS.md` (gitignored, so machine paths stay off GitHub). This file is the public summary.

## Setup

[Node.js](https://nodejs.org/) 22 or newer (`node:sqlite`).

```bash
git clone https://github.com/wtampa/family-tree-viewer.git
cd family-tree-viewer
npm install
npm run fetch-samples
npm run dev
```

Dev server: Vite on port 5181, API proxied to `127.0.0.1:5180` only if you also run `npm run serve`. Day-to-day: `npm run serve` after `npm run build`.

## Checks

```bash
npm run fetch-samples
npm run check -- --all
npm run build
```

`check -- --all` parses every sample that is on disk. It must exit 0.

## What not to send

- A real family file (`.gramps`, `.ged`, `tree.db`, portraits of real people)
- `settings.json`, `links.json`, `hints-state.json`, `media-map.json`, or anything under `notes/`
- Character artwork. Portrait manifests (`sample/*/portraits.json`) may list wiki URLs. The image files stay local.
- A change that binds `0.0.0.0` or adds a public upload API

Unknown parents stay unknown. Do not invent given names in hints, fixtures, or docs.

## License

By contributing, you agree that your code is licensed under the MIT license in [LICENSE](LICENSE). Sample data keeps its upstream license. See [sample/README.md](sample/README.md).
