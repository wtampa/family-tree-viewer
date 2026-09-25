# Start here

You do not need to be a programmer. You need [Node.js](https://nodejs.org/) 22 or newer, then this app on your computer. Your family file stays on this machine.

If you already have Gramps, skip to [Your own file](#your-own-file). If you are coming from Ancestry, start with the GEDCOM steps below. After you can open a sample, the [15-minute tutorial](TUTORIAL.md) walks the British royal tree.

## What a GEDCOM is

A GEDCOM (`.ged`) is one portable family file: names, dates, places, and relationships. Almost every genealogy program can export and import it.

Photos and most document images usually do **not** travel with the file. Ancestry member trees are other people’s conclusions, not a source. Prefer a census, certificate, or other record when you have one.

## Export a tree from Ancestry

Menu names on Ancestry move. The job is the same: export **your** tree as a GEDCOM, then download the `.ged` when Ancestry finishes it.

1. Sign in at Ancestry and open the tree you want.
2. Open **Tree Settings** (often a gear, or a menu on the tree name).
3. Find **Export tree** (sometimes under tree info or manage your tree).
4. Start the export. Ancestry builds the file in the background and emails a link, or offers a download on that same settings page.
5. Save the `.ged` somewhere you will find it. Do not put it on GitHub.

FamilySearch can also export a GEDCOM from a tree you own. In Gramps: **Family Trees → Export** and choose GEDCOM, or keep a `.gramps` file.

## Your own file

1. Make a research folder (any name). Inside it, make a `data` folder.
2. Copy the export there as either `data/data.ged` or `data/data.gramps`.
3. In the app folder, copy `settings.example.json` to `settings.json`.
4. Set `personalRoot` to that research folder (the folder that **contains** `data/`, not the `.ged` itself).
5. Restart Family Tree (desktop icon or `Open Family Tree.bat`). The first load imports the file into `data/tree.db` and does not write the `.ged` or `.gramps` again.
6. In the **Tree** menu, pick **My tree (local)**.

Leave **Living hidden** on until you know the file. Then open **Hints** (key `8`). Hints list missing evidence. They never invent a given name or a parent.

To send a copy back to Ancestry later, use **Export GEDCOM** in this app, then Ancestry **Tree Settings → Import**. Ancestry will not receive photos you attached here; add those on Ancestry if you need them there.

Do not commit `settings.json`, `tree.db`, or a real family file.

## Try a sample first

```bash
git clone https://github.com/wtampa/family-tree-viewer.git
cd family-tree-viewer
npm install
npm run fetch-samples
```

On Windows, double-click `Open Family Tree.bat`. On any OS: `npm run serve`, then open `http://127.0.0.1:5180/`. Pick **British royal family**. Living names stay hidden.

Full click path: [USERGUIDE.md](USERGUIDE.md).
