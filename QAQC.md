# Family Tree Viewer — QAQC SOP

Hand this file to **another model** (or a later chat) and say: **run the publish QAQC**.

Scope: this repository only. Do **not** open the research library as a workspace root. Do **not** edit `data.gramps`. Do **not** invent given names. Do **not** write living or deceased personal names, emails, or Gramps IDs from a private tree into any **tracked** file (including this one).

Product rule: localhost overlay, MIT, no public/cloud upload, no `0.0.0.0`. Closest docs: [README.md](README.md), [NEXT.md](NEXT.md), [CONTRIBUTING.md](CONTRIBUTING.md). `AGENTS.md` is local and gitignored.

---

## How to run

1. Work only in this repository.
2. Complete every section. Use the commands; do not eyeball.
3. End with the **Report** block (verdict + findings). Severity:
   - **FAIL** — would leak a private family, ship a secret, break the “localhost only” promise, or commit a forbidden file. Block commit/push until fixed.
   - **WARN** — machine layout, operator docs, docs drift, missing polish. Fix or accept in the report.
   - **INFO** — noted, not blocking.
4. If you fix FAILs, **re-run the leak and gitignore sections**. Do not declare PASS on stale greps.
5. Put a written report in chat, or in `notes/` (gitignored). Never commit a report that lists private-tree names.

```
VERDICT: PASS | PASS_WITH_WARNINGS | FAIL
```

PASS = zero FAILs. PASS_WITH_WARNINGS = zero FAILs and at least one WARN you listed.

---

## 0. Preflight

```bash
git status --short
git remote -v
git log --oneline -5
git ls-files
```

| Check | Pass if |
| --- | --- |
| Repo unit | Only this folder. No research library, no `data.gramps` in the tree. |
| History | `git log -p` / `git rev-list --all` has **no** sidecars, `notes/`, or family files. Empty repo (no commits) is OK. |
| Remote | If a remote exists, assume it is or will be **public**. |

If history already contains a leak, **FAIL**. Do not `git filter-repo` unless the user asked. Report the commit hashes.

---

## 1. Gitignore and what would be committed

Dry-run only — do not `git add` unless the user asked for a commit.

```bash
git add -n .
git status --short --ignored
```

Confirm these are **ignored** (FAIL if any would be added):

| Path | Why |
| --- | --- |
| `settings.json` | `personalRoot`, home person IDs |
| `links.json` | URLs and local paths tied to people |
| `hints-state.json` | Research notes |
| `media-map.json` | Local file paths |
| `notes/` | Local work logs; may name people |
| `.cache/` | Logs, OG cache |
| `node_modules/`, `dist/`, `*.log` | Build junk |
| `sample/**/*.gramps`, other `sample/**/*.ged`, `sample/**/media/` | Fetched binaries; queen is large. The three fan GEDCOMs and `sample/fixtures/*.ged` are tracked on purpose |
| Any path under the research library (`data/data.gramps`, portraits, `00_Data_In`) | Private tree |

Confirm these **are** committable: `src/`, `server/`, `server.mjs`, `package.json`, `package-lock.json`, `LICENSE`, `README.md`, `QAQC.md`, `CONTRIBUTING.md`, `start.sh`, `sample/catalog.json`, `sample/README.md`, `sample/queen/LICENSE`, `sample/queen/UPSTREAM.md`, `settings.example.json` (no real path required), `sample/simpsons/Simpsons.ged`, `sample/ducktales/DuckTales.ged`, `sample/harry-potter/HarryPotter.ged`, `sample/fixtures/ancestry-style.ged`, `sample/fixtures/ancestry-style-utf16.ged`.

```bash
git check-ignore -v settings.json notes/INDEX.md sample/queen/queen.gramps
```

Each must print an ignore rule. Missing rule = **FAIL**.

---

## 2. Leak hunt (highest priority)

### 2a. Derive a private wordlist (local only)

Do this in the shell / scratch. **Do not paste the wordlist into README, NEXT, QAQC, or any commit.**

1. If `settings.json` exists, read `personalRoot` and `homeByTree.personal` only to know where the private file is.
2. If a personal tree is present:

```bash
npm run check
```

3. From that output and the parsed tree (read-only), collect: given names, surnames, full names, Gramps/GEDCOM IDs (`I…`, handles), street addresses, emails, phone numbers, SSNs, and unique place phrases that identify a living household.
4. Also scan gitignored `notes/` for names the operator already wrote down. Use them as search terms only.

If there is **no** personal tree, skip 2a and still run 2b–2d.

### 2b. Search tracked source and docs

Search **tracked** files only (`git ls-files` after a commit; before the first commit, search `src/`, `server/`, `*.md` except `notes/`, `*.js`, `*.jsx`, `*.mjs`, `*.json` except gitignored sidecars).

| Class | How | FAIL if found in tracked files |
| --- | --- | --- |
| Private-tree **people** | Grep each wordlist name (whole word, case-insensitive) | Any living or deceased person from the private file |
| Private **IDs** | Grep `I[0-9]{8,}` and wordlist IDs | IDs that exist only in the private Gramps file (sample trees may have their own `I…` — those are OK if they resolve in a sample) |
| Contact / ID numbers | Grep `@`, `ssn`, `social security`, phone-like `\b\d{3}[-.]?\d{3}[-.]?\d{4}\b` | Real emails/phones/SSNs (not example.com) |
| Research library dumps | Grep `00_Data_In`, `brick-walls/OPEN`, `data.gramps` **with a person’s name on the same line** | Name + private path together |
| Cursor / user home | Grep `C:\\Users\\`, `.cursor\\projects` | Absolute profile paths that include the operator username |

**OK (not a FAIL by themselves):**

- A hardcoded research-library path in a tracked file. Treat as **WARN**. `AGENTS.md` is gitignored so local machine notes stay off GitHub. `settings.example.json` must keep `personalRoot` empty.
- Public sample names (Elizabeth II, George Washington, Laura Ingalls).
- Generic placeholders: `Living`, `Unknown`, `personalRoot`, `My tree (local)`.

### 2c. Hardcoded machine / family fixtures in code

Inspect these files even if greps are clean:

| File | Look for |
| --- | --- |
| [server/trees.mjs](server/trees.mjs) | `defaultHomeId` must not be a private Gramps ID. `personalRoot()` comes from `settings.json`, or from a sibling `data/data.gramps` when that file exists. No hardcoded drive path. |
| [server/check.mjs](server/check.mjs) | No `if (entry.id === "personal")` blocks that print or match private names. |
| [src/components/ResourceLinks.jsx](src/components/ResourceLinks.jsx) | Archive links (PARES, Antenati) must be **place-based**, not a private-surname allowlist. |
| [settings.example.json](settings.example.json) | No real `personalRoot`, no private home IDs. Empty `personalRoot` is correct. |
| [README.md](README.md) / [NEXT.md](NEXT.md) | No private names, no kinship “verify: *this relative* = …” fixtures. |

### 2d. Media and binaries

```bash
git add -n -- '*.jpg' '*.jpeg' '*.png' '*.pdf' '*.gramps' '*.ged' '*.gedcom'
```

FAIL if any portrait, PDF, or tree file from the research library would be added. `tree-icon.png` / `tree.ico` (app icon) are OK.

---

## 3. Security / “do not become a host”

| Check | Pass if | Sev |
| --- | --- | --- |
| Bind address | [server.mjs](server.mjs) `HOST` is `"127.0.0.1"`. No `0.0.0.0` / `::`. | FAIL |
| Local ingest only | `/api/ingest-media` writes only under `{personalRoot}/sources/…` (portraits / people), allowlisted types, size cap. HOST is `127.0.0.1`. | FAIL if it writes the app repo, has no type/size limit, or is reachable off localhost |
| Dangerous routes still local-only | `/api/open` (Explorer), `/api/files` (directory list), `/api/media`, `/api/file`, `/api/ingest-media` exist for **desktop** use. They must stay behind localhost. Do not “fix” by adding auth unless asked. | INFO if localhost; FAIL if HOST is public |
| Living privacy | [server/privacy.mjs](server/privacy.mjs) redacts names/dates/notes/media when `hideLiving`. Samples default hidden. | WARN if a sample defaults to shown |
| Share pack | [server/share-export.mjs](server/share-export.mjs) **forces** redaction (no hide-living bypass); packs write only under `{personalRoot}/data/exports/` or `.cache/share/` (gitignored); `/share/` preview stays behind `HOST` `127.0.0.1`; no share pack, `tree.json`, or pack media in git. | FAIL if redaction is skippable, a pack lands in a tracked path, or `/share/` is reachable off localhost |
| README promise | README says localhost only and “do not put a real family file on GitHub.” | WARN if missing |
| Preview SSRF | `/api/preview` blocks private IPs. | WARN if missing |

Do **not** add cloud auth, S3, or a public upload API in this QAQC. Localhost ingest under the research folder is allowed.

---

## 4. Software SOP (every slice, not only publish)

Re-run this section after any feature work.

### 4a. Product rules

| Rule | FAIL if |
| --- | --- |
| Read-only tree | Code writes the `.gramps` / `.ged` file |
| No invented people | Hints or UI invent a given name or a parent | `npm run check` prints `invented ???` > 0 or `invented-name mentions` > 0 |
| Unknown stays unknown | Placeholders become “real” people |
| Two-folder layout | New app scaffolded under the research library |
| Hive metaphor | Hive laid out on **birth year** (that is Family Plot). Keep **generation layers** |

### 4b. Commands

```bash
npm run fetch-samples
npm run check -- --all
npm run build
```

| Command | Pass if |
| --- | --- |
| `fetch-samples` | Catalog trees exist under `sample/` after the run |
| `check -- --all` | Each sample parses; dangling/cycles reported; **exit 0** |
| `build` | Vite succeeds |

Optional click-check (do this if you changed UI): `Open Family Tree.bat` or `npm run serve` → `http://127.0.0.1:5180/` → switch to a **sample** tree (not the personal one) → open Pedigree, Fan, Timeline, Hive, Sources, Hints, person drawer, living-privacy toggle.

### 4c. Best-practice hygiene

| Check | Pass if | Sev |
| --- | --- | --- |
| Lockfile | `package-lock.json` present and matches `package.json` | WARN |
| No secrets | No `.env`, API keys, tokens, cookies | FAIL |
| License | [LICENSE](LICENSE) is MIT; [sample/README.md](sample/README.md) keeps upstream licenses; queen [CC BY-SA 4.0](sample/queen/LICENSE) attributed | FAIL if queen shipped without credit |
| `package.json` `private` | `"private": true` is OK (not an npm publish). Do not publish to npm in this SOP | INFO |
| README clone URL | After a real GitHub repo exists, `YOUR_USER` is gone | WARN until then |
| Sample fetch is enough | Clone + `npm install` + `fetch-samples` runs without a personal tree | FAIL if the app crashes with no `settings.json` |

---

## 5. Docs and operator files

| File | Public? | Check |
| --- | --- | --- |
| `README.md` | Yes | Stranger can run it; localhost warning; no private names |
| `QAQC.md` | Yes | This file must not contain a private wordlist |
| `NEXT.md` | Yes | Backlog only; no “verify on *relative X*” |
| `AGENTS.md` | Optional | Local Cursor rules (paths, hung-chat IDs). Gitignored. Public summary: [CONTRIBUTING.md](CONTRIBUTING.md). **WARN** if machine layout is committed. Not a FAIL if it has no person names |
| `notes/` | No | Must stay ignored |
| Work hive / `board.json` | No | Outside this repo. Do not copy into `notes/` or the GitHub tree |

---

## 6. When to run which slice

| Trigger | Run |
| --- | --- |
| Before **first commit** or any **push** | §§0–5 |
| After a **feature** (map, names, hints, UI) | §4 + click-check; §2 if you touched docs or fixtures |
| After someone says **check work / QAQC** | Full file |
| After a **personal tree** change | Never commit the tree. Re-run §2a–2b so new names did not land in `src/` or `NEXT.md` |

---

## 7. Report template (paste at the end)

```text
VERDICT: PASS | PASS_WITH_WARNINGS | FAIL

Git: <no remote | remote URL>  commits: <n>
Would-commit leaks: <none | list paths, not names>
Ignore rules: <ok | missing>

Leak §2: <ok | FAIL/WARN list>
Security §3: <ok | …>
Software §4: fetch-samples <ok/fail>  check --all <ok/fail>  build <ok/fail>
Docs §5: <ok | …>

FAIL (block push):
- …

WARN (accept or fix):
- …

Fixes made this run:
- …
```

If FAIL: fix, re-run §§1–2, then give a new verdict. Do not push.

If PASS or PASS_WITH_WARNINGS: stop. Do **not** create a GitHub repo or commit unless the user asked in that chat.
