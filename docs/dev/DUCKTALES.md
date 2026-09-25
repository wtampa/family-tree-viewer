# DuckTales GEDCOM — handoff

Point a new chat at this file: `docs/dev/DUCKTALES.md`

Build one local GEDCOM of the Disney Duck family that DuckTales uses. Do not re-scaffold the app. Do not edit `{personalRoot}/data/data.gramps` or the personal SQLite tree. Do not invent names.

## Write this file

`sample/ducktales/DuckTales.ged`

That GEDCOM is already in the repository. Do not download Don Rosa’s chart image or any character art into the repo. Portrait files under `sample/**/media/` stay gitignored.

Then add one entry to `sample/catalog.json` so the tree picker can open it:

- `id`: `ducktales`
- `title`: `Duck family (DuckTales)`
- `file`: `sample/ducktales/DuckTales.ged`
- `homeHints`: `["Scrooge McDuck", "Donald Duck"]`
- `license`: note that names and relationships are from published Disney comics and episode guides, and this file is a local demo, not a Disney product
- `blurb`: Don Rosa’s Clan McDuck / Duck / Coot tree, which the DuckTales shows use. Not a mix of every contradictory comic.

Restart the app (or hard-refresh) and open that sample. Home person should land on Scrooge or Donald.

## What to include

One continuity: **Don Rosa’s Duck Family Tree (US version, 1995)**, the chart behind *The Life and Times of Scrooge McDuck* and the 1987 *DuckTales* household.

Three clans on that chart, and only people the sources actually connect:

- **Clan McDuck** — Scrooge, Matilda, Hortense, and the ancestors the chart names (Fergus, Jake, Angus “Pothole”, Downy O’Drake, Dingus, Quackmore’s McDuck line, and the medieval McDucks the chart names).
- **The Duck family** — Quackmore and Hortense’s children Donald and Della; Della’s sons Huey, Dewey, and Louie; plus the other Ducks the chart names (Humperdink, Elvira, Dabney, Eider, and so on) only when a parent or spouse is stated.
- **Coot kin** — Grandma Duck (Elvira Coot) and the Coot line the chart names, through to Donald.

Also include people the chart places by a stated marriage or parent link: Gladstone Gander, Fethry Duck, Abner “Whitewater” Duck, Gus Goose, and their stated parents.

DuckTales 1987 adds no new blood parents for that household. Launchpad, Gyro, the Beagle Boys, and Webby are not on the Rosa blood tree. Leave them off unless a source you cite states a parent, spouse, or child link. Daisy is Donald’s girlfriend on that chart, not his wife. Do not add a marriage. April, May, and June are not Donald’s daughters on that chart. Do not add them as his children.

## 2017 series

Do not merge the 2017 *DuckTales* finale into this parent chart. That season rewrites Webby’s connection to Scrooge and contradicts the Rosa tree. If you find a clearly sourced 2017-only parent link, put it in a `NOTE` on the person. Do not add a `FAM` for it. This app’s GEDCOM loader stores every child link as a birth (`server/gedcom-parse.mjs`), so an adoptive or “revealed in the finale” link would draw as a biological child.

## Where to read

Use published trees and episode or comic guides. Prefer a page that lists parents by name over a picture of the chart.

- Wikipedia: “Duck family (Disney)” and “Clan McDuck”
- Don Rosa’s US tree, described at the archived D.U.C.K.man page: `https://web.archive.org/web/20070901021552/duckman.pettho.com/tree/american.html`
- The Feathery Society fan table at `https://duckfamilytree.com/` — use it to confirm a link, and skip anyone they only include as a translation, clone, or one-off fiancé
- A DuckTales episode guide only for the 1987 household (Scrooge as Donald’s uncle, Della as the boys’ mother). Do not promote a TV guest into the tree

If two sources disagree, keep the Rosa chart and mention the other claim in a `NOTE`. If no source names a parent, leave that parent out. Do not create “Unknown Duck” or “Various” people.

## GEDCOM shape

GEDCOM 5.5.1, UTF-8, line endings that a normal genealogy import accepts. One `INDI` per person, one `FAM` per couple who have a stated union or who are the stated parents of a child.

```
0 HEAD
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Scrooge /McDuck/
2 GIVN Scrooge
2 SURN McDuck
1 SEX M
1 FAMC @F1@
1 NOTE Uncle of Donald Duck on Don Rosa's US Duck Family Tree.
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 TRLR
```

Tags this app actually reads (`server/gedcom-parse.mjs`):

- `NAME` as `Given /Surname/` (the slashes are required)
- `SEX` `M` or `F`
- `FAMC` on the child, `FAMS` on each spouse
- `FAM` with `HUSB`, `WIFE`, and `CHIL`
- `BIRT` and `DEAT` with `DATE` and `PLAC` only when a source gives them
- `MARR` on the family when the source says they married
- `NOTE` for a nickname, a continuity warning, or a source sentence
- `ADOP` only as a note-level event. It will not change how the chart draws the child

Every pointer must match a record. Every child in a `FAM` must have that family on `FAMC`, and each parent must have it on `FAMS`.

## Check before you stop

Count `INDI` and `FAM` lines. Confirm Scrooge’s parents are Fergus McDuck and Downy O’Drake, Donald’s parents are Quackmore Duck and Hortense McDuck, and Huey, Dewey, and Louie are Della’s sons. Confirm Webby is not Scrooge’s child in this file. Open the sample in the app and look at Scrooge’s pedigree and Donald’s descendants.
