# Contributing

Family Tree is a localhost app. Pull requests are welcome for bug fixes, views, and docs.

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
