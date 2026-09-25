# Tutorial

About fifteen minutes on the British royal sample. You need [Node.js](https://nodejs.org/) 22+. New to GEDCOM or Ancestry: start with [START.md](START.md).

## 1. Install and open a sample

```bash
git clone https://github.com/wtampa/family-tree-viewer.git
cd family-tree-viewer
npm install
npm run fetch-samples
npm run serve
```

Open `http://127.0.0.1:5180/`. On Windows you can double-click `Open Family Tree.bat` instead of `npm run serve`.

Open the **Tree** menu (or `Ctrl+K`, then type the tree name) and choose **British royal family**. Leave **Living hidden** on. Names of people the app treats as living show as "Living".

Direct link, after the server is up: `http://127.0.0.1:5180/?tree=queen&view=pedigree`

## 2. Pedigree

Key `1`. The chart is ancestors of the person at the center. Click a card to re-root on that person. Shift-click opens the drawer without moving the root. The depth slider is in the chart toolbar.

## 3. Fan and the gold diamonds

Key `4`. Dashed wedges are unknown parents. A gold diamond means the **same person id** sits in two ahnentafel slots (pedigree collapse). Two different records for one real person do not get a diamond; the app does not merge them.

## 4. Hive

Key `6`. The tree is stacked by generation, ancestors toward the top. This is not a birth-year axis. Drag to orbit. The sliders change layout, color, scope, and how many generations are drawn. Portraits on this sample come with the queen download (CC BY-SA 4.0).

## 5. Person drawer

Click a card. Overview lists parents, spouses, children, and a kinship path (blood, plus one marriage hop). The census-year row runs from the first US place through death. The places path draws a map when the file already has coordinates.

## 6. Hints

Key `8`. Hints are missing vitals, uncited events, brick walls, and possible duplicates. They never invent a given name or a parent. Pin, done, and dismiss are stored in gitignored `hints-state.json` on your machine.

## 7. Your own file

1. Copy `settings.example.json` to `settings.json`.
2. Set `personalRoot` to the folder that contains `data/data.gramps` or `data/data.ged`.
3. Restart. The first load imports that file into `data/tree.db` and does not write the source file again.
4. Turn on **Edit** in the top bar. Changes have undo. **Export** writes a new timestamped `.gramps` or `.ged` under `data/exports/`.

Do not commit `settings.json` or the database.

## 8. Optional character portraits

```bash
npm run fetch-portraits -- simpsons
```

That downloads images listed in `sample/simpsons/portraits.json` into `sample/simpsons/media/`. Those images are not in the git repository. Then pick **The Simpsons** in the Tree menu.
