# Sample trees

Public demo files for the viewer. **None of these are a genealogical authority.** The Simpsons, Duck family, and Harry Potter GEDCOMs are in this repository. Other trees are downloaded by `npm run fetch-samples`. The repository does not ship character art. `npm run fetch-portraits` optionally downloads portraits onto your machine from the wiki pages named in each `portraits.json`.

| Id | File | What | Where it comes from | License |
| --- | --- | --- | --- | --- |
| `queen` | `queen/queen.gramps` | British royal family (Gramps Web demo) + portraits | [gramps-web-example-tree-queen](https://github.com/DavidMStraub/gramps-web-example-tree-queen) | [CC BY-SA 4.0](https://github.com/DavidMStraub/gramps-web-example-tree-queen) |
| `presidents` | `presidents/US_Presidents_2022-11-02.gramps` | US Presidents | [emyoulation/example-Gramps-Trees](https://github.com/emyoulation/example-gramps-trees) | See upstream |
| `ingalls` | `ingalls/1880_Ingalls_Family_2024-01-10.gramps` | Ingalls / 1880 census teaching file | example-Gramps-Trees | See upstream |
| `royal92` | `royal92/royal92.ged` | European royalty (~3,010 people) | example-Gramps-Trees | Public domain (Denis R. Reid) |
| `simpsons` | `simpsons/Simpsons.ged` | The Simpsons | In this repository | Names from the published series. Not a Fox product. Portraits fetched locally from the Simpsons Fandom wiki; not redistributed here. |
| `ducktales` | `ducktales/DuckTales.ged` | Don Rosa Duck / McDuck / Coot tree | In this repository | Names and relationships from published Disney comics and episode guides. Not a Disney product. Portraits fetched locally from Fandom; not redistributed here. |
| `harry-potter` | `harry-potter/HarryPotter.ged` | Potter, Weasley, and Black lines | In this repository | Names from the published books. Not a Warner Bros. product. Portraits fetched locally from Fandom; not redistributed here. |
| `asoiaf-kings` | `asoiaf/Kings-GenoPro.ged` | Westeros kings | [GenoPro public tree (AngelEyes)](https://familytrees.genopro.com/AngelEyes/KINGS/FamilyTree.ged) | Someone else's public GEDCOM, fetched from that URL. Not an HBO product. Portraits fetched locally from [A Wiki of Ice and Fire](https://awoiaf.westeros.org/); not redistributed here. |

```bash
npm run fetch-samples
npm run fetch-portraits
```

Downloaded `.gramps` and `.ged` files, and every `media/` folder, are gitignored. The three fan GEDCOMs above are the exception.

Your own Gramps file is **not** stored here. Point `settings.json` → `personalRoot` at the folder that contains `data/data.gramps`. It stays off git.
