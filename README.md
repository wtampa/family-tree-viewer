# Family Tree

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22%2B-green.svg)](https://nodejs.org/)
[![CI](https://github.com/wtampa/family-tree-viewer/actions/workflows/check.yml/badge.svg)](https://github.com/wtampa/family-tree-viewer/actions/workflows/check.yml)

Localhost genealogy app. Imports [Gramps](https://gramps-project.org/) XML and GEDCOM. **My tree** lives in a SQLite database on your machine. Sample trees stay read-only.

The server binds **`127.0.0.1` only**. Do not expose it to the internet, and do not put a real family file on GitHub.

<p align="center">
  <img src="docs/assets/hero.png" alt="Hive 3D view of the British royal sample, living people hidden" width="100%" />
</p>

## Introduction

Family Tree is a desktop viewer and editor for one genealogist at a time. It draws a tree by generation, flags research gaps without inventing people, and keeps the writable copy in SQLite so the original Gramps file is never overwritten.

It is free (MIT). There is no account, no upload, and no hosted copy of your tree. Relatives who want the same app clone it and run it themselves. A read-only pack for a private link is described in [docs/FAMILY.md](docs/FAMILY.md); that pack is still produced on localhost.

How to click through it: [docs/USERGUIDE.md](docs/USERGUIDE.md). A short path on the royal sample: [docs/TUTORIAL.md](docs/TUTORIAL.md).

## Why this exists

GEDCOM and Gramps already store the genealogy. What is awkward is looking at a whole tree, seeing where the evidence stops, and editing without a hosted service in the middle.

| | Family Tree | [Family Plot](https://github.com/oh-kay-blanket/family-plot) | [Topola](https://github.com/PeWu/topola-viewer) | [Gramps Web](https://github.com/gramps-project/gramps-web) |
| --- | --- | --- | --- | --- |
| 3D layout | generations (ancestors up) | birth year | — | — |
| Edit | local SQLite, undo | GEDCOM edits | view | hosted Gramps |
| Hints | never invents a name | — | — | — |
| Bind | `127.0.0.1` only | local | local / static | server you host |

This app is not Family Plot (that project’s 3D axis is birth year) and it is not a multi-user host.

## Key features

### Views

- Pedigree, descendants, and hourglass
- Fan chart. Dashed wedges are unknown parents. A gold diamond means the same person id occupies two ahnentafel slots
- Timeline of lifespans, plus a places map when the file already has coordinates
- Hive 3D: the whole tree in generation layers, with portraits
- Sources table and a hints dashboard
- History of saved edits on My tree

### Research hints

Person score 0–100 from weighted citations. Hint types include brick wall, missing vitals, uncited events, and possible duplicates. The engine does not invent a given name or a parent. Kinship paths are blood plus one marriage hop.

### Editing and export

On My tree: names, gender, events, notes, parents, spouses, children, sources, and portraits, with undo. Choosing a photo copies it into your research folder (`sources/portraits` or `sources/people`) and does not upload it. Export writes a new timestamped Gramps XML or GEDCOM file. The original `data.gramps` is not modified.

### Privacy

Sample trees hide living names, dates, notes, and portraits until you unlock them. A share pack redacts living people even if the desktop toggle is unlocked.

## Screenshots

British royal sample, **Living hidden** on.

<img src="docs/screenshots/hive.png" alt="Hive 3D" width="100%" />

<img src="docs/screenshots/fan.png" alt="Fan chart with gold pedigree-collapse diamonds" width="100%" />

<img src="docs/screenshots/timeline.png" alt="Timeline" width="100%" />

<img src="docs/screenshots/hints.png" alt="Research hints" width="100%" />

<img src="docs/screenshots/drawer.png" alt="Person drawer" width="100%" />

## Installation

Needs [Node.js](https://nodejs.org/) 22 or newer.

```bash
git clone https://github.com/wtampa/family-tree-viewer.git
cd family-tree-viewer
npm install
npm run fetch-samples
```

`fetch-samples` downloads the public demo trees into `sample/`. Those downloaded binaries are gitignored. The Simpsons, Duck family, and Harry Potter GEDCOMs are already in the repository. Optional character portraits (not shipped in git):

```bash
npm run fetch-portraits
```

## Quick start

- **Windows:** double-click `Open Family Tree.bat`. It starts Node on `127.0.0.1:5180` and opens a chromeless Edge window. Re-clicking reuses the server. First run installs and builds. Optional desktop icon: right-click `Put Family Tree on Desktop.ps1` → Run with PowerShell.
- **Any OS:** `npm run serve`, then open `http://127.0.0.1:5180/`.
- Dev: `npm run dev` (Vite on 5181, proxies `/api`).
- Parser check: `npm run check` or `npm run check -- --all`.

Open a view with a query string: `http://127.0.0.1:5180/?tree=queen&view=hive`. `person=home` opens the home person’s drawer.

### Your own tree

Copy `settings.example.json` to `settings.json` (gitignored). Set `personalRoot` to the folder that contains `data/data.gramps`. The first load imports that file into `data/tree.db` and never writes the Gramps file again.

## Sample trees

| Tree | Why it’s here | Download |
| --- | --- | --- |
| British royal family | Portraits, pedigree collapse, Hive | `fetch-samples` from [Gramps Web queen demo](https://github.com/DavidMStraub/gramps-web-example-tree-queen) (CC BY-SA 4.0) |
| US Presidents | Compact native `.gramps` | [example-Gramps-Trees](https://github.com/emyoulation/example-gramps-trees) |
| Ingalls (1880) | Tiny census file | example-Gramps-Trees |
| royal92 | Public-domain European royalty | example-Gramps-Trees (Denis R. Reid) |
| The Simpsons, Duck family, Harry Potter | Small fan demos | GEDCOM files in this repository |
| Westeros kings | GenoPro public tree | fetched from its [origin URL](https://familytrees.genopro.com/AngelEyes/KINGS/FamilyTree.ged) |

Character faces for the fan trees and Westeros are not in the repository. `npm run fetch-portraits` downloads them from the wiki URLs in each `portraits.json`. See [sample/README.md](sample/README.md).

## Data model

Gramps XML and GEDCOM import into one JSON model. My tree is stored in SQLite (`people`, `families`, `events`, `places`, `citations`, `sources`, `notes`, `media`, plus undo and history tables). Details: [docs/DATA.md](docs/DATA.md).

## Tutorial

[docs/TUTORIAL.md](docs/TUTORIAL.md) — royal sample, fan diamonds, hive, drawer, hints, then your own file.

## Citation

If you use this app in writing, cite the repository. Metadata is in [CITATION.cff](CITATION.cff).

```bibtex
@software{familytreeviewer,
  title = {Family Tree},
  author = {wtampa},
  year = {2026},
  url = {https://github.com/wtampa/family-tree-viewer},
  version = {1.0.0},
  license = {MIT}
}
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Behavior toward other people: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security

Localhost only. Reporting a leak or a bind-address bug: [SECURITY.md](SECURITY.md).

## License and acknowledgments

Viewer code is MIT ([LICENSE](LICENSE)).

- British royal sample: [DavidMStraub/gramps-web-example-tree-queen](https://github.com/DavidMStraub/gramps-web-example-tree-queen), CC BY-SA 4.0
- Presidents, Ingalls, royal92: [emyoulation/example-Gramps-Trees](https://github.com/emyoulation/example-gramps-trees)
- Westeros kings GEDCOM: public GenoPro tree by AngelEyes
- Charts: [family-chart](https://github.com/donatso/family-chart), [D3](https://d3js.org/), [Three.js](https://threejs.org/)

Character portraits, when you fetch them, stay under the license of the wiki file you downloaded. This repository does not grant rights to those images.
