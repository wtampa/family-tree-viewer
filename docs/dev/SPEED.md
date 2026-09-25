# Family Tree Viewer — speed fixes (do this chat)

Point a new chat at this file: `docs/dev/SPEED.md`  
Also read `AGENTS.md` (local, gitignored) — public summary in [CONTRIBUTING.md](../../CONTRIBUTING.md) — and `NEXT.md`.

This is the **implementation** brief. A prior review measured the bottlenecks ([speed review](e770b56f-6756-42b0-be4d-6cedc13acb7f)); a second pass agreed with the numbers and **reordered** the work. Follow **this** order, not the canvas / old trace.

Do **not** re-scaffold. Do **not** edit `{personalRoot}/data/data.gramps`. Do **not** invent names. Do **not** add gzip. Do **not** use `cursor-ide-browser` or `browser_lock` (those chats hang). Verify with `curl`, `npm run build`, and the desktop app / Edge window.

---

## Why (one paragraph)

`settings.json` is still on the **queen** sample (4,668 people). That tree’s `/api/tree` is ~15.6 MB uncompressed and `/api/hints` is ~10.6 MB / 10,790 rows, both fetched on boot. The personal tree is ~229 people / 43 ms parse / ~917 KB JSON — already fast. The main JS chunk is 1.9 MB (`dist/assets/index-BLCY9P_G.js`) because `App.jsx` statically imports Hive (Three.js + force-graph), Fan/Timeline (full `d3`), Sources, and Hints even when the first view is pedigree. Gzip is **not** worth doing: the server is `127.0.0.1` only; loopback bandwidth is not the cost — `JSON.stringify` / `JSON.parse` / JS compile are.

---

## Do in this order

Ship, rebuild, and check after each step. Stop after 5 unless something is still slow on **My tree (local)**.

### 1. Switch the running app to My tree (local)

This is the actual daily-use fix. Code changes below mainly help samples and first-open CPU.

**File (gitignored sidecar):** `settings.json`

Current: `"treeId": "queen"`, `"grampsFile": "sample/queen/queen.gramps"`.

Set:

- `treeId` → `"personal"`
- `grampsFile` → `"data/data.gramps"` (resolved under `personalRoot`)

Keep `personalRoot`, `homeByTree`, `hideLivingByTree`. Do not invent a `homeId` if `homeByTree.personal` is already set. Do not touch the Gramps file.

**Check:** restart `Open Family Tree.bat` (port 5180). Top bar should show ~229 people and **My tree (local)** in the tree picker. `GET http://127.0.0.1:5180/api/version` → `treeId: "personal"`.

Do not commit `settings.json`.

---

### 2. `React.lazy` the non-pedigree views

**File:** `src/App.jsx`

Keep **eager**: `ChartView` (pedigree / descendants / hourglass — default first paint), drawer, palette, portrait.

Lazy-load:

- `HiveView` (Three + `react-force-graph-3d`) — this is the big CPU win
- `FanView` (full `d3`)
- `TimelineView` (full `d3`)
- `SourcesView`
- `HintsView`

`html-to-image` is already a dynamic import. Leave it.

Keep the existing `hiveSeen` keep-alive: once Hive has been opened, it stays mounted and pauses when hidden. Lazy only affects the **first** Hive visit (chunk download + compile). Wrap the lazy trees in `<Suspense fallback={…}>` (reuse the boot “Loading…” treatment; do not invent a new design system).

**Check:** `npm run build`. `dist/assets/` should split Hive / d3 / views out of the main `index-*.js`. Main chunk should drop well below 1.9 MB. Pedigree still renders on first open without waiting for Hive.

---

### 3. Drop `handleToId` from `/api/tree`

**File:** `server.mjs` → `treePayload()`

`handleToId` is a Gramps-handle → public-id map. Parsers and `resolveHandles()` need it **on the server**. Nothing in `src/` reads it (~1 MB on queen).

Clone/omit it on the way out. Do **not** `delete` it on `cache.model` (that would break later handle resolution).

```js
const model = { ...view.model };
delete model.handleToId;
```

**Check:** `GET /api/tree` JSON no longer contains `"handleToId"`. Pedigree, drawer, and hive still resolve people by public id. On queen (optional switch-back), payload shrinks ~1 MB.

---

### 4. Memoize hover-peek kinship

**File:** `src/App.jsx` ~line 322

Today every hover calls `model.kinship(model.homeId, hover)` with no memo. `kinshipReport` does two ancestor-path DFS walks. On royal92 / queen that is ~10 ms per peek.

```js
const kinPeek = useMemo(() => {
  if (!hoverP || !hover) return "";
  if (model.homeId === hover) return "home person";
  return model.kinship(model.homeId, hover);
}, [model, hover, hoverP]);
```

Use `kinPeek` in the peek card. Do **not** precompute all-pairs kinship. Drawer already memoizes `kinshipReport` on `pid`.

**Check:** hover several people on pedigree; peek still shows a relationship string; no extra walks on re-render of the same id.

---

### 5. Defer the hints download (keep the badge)

**Files:** `src/App.jsx`, `server.mjs` (and only if needed `server/hints.mjs`)

Today:

```js
useEffect(() => { if (model && !hints && !hintsLoading) loadHints(); }, [model, hints, hintsLoading, loadHints]);
```

That pulls the full hint list as soon as the tree arrives (10.6 MB on queen). The Hints **tab badge** (`openHintCount`) and `PersonDrawer` both read `hints`.

Do this:

1. Remove the eager `useEffect`.
2. Fetch `/api/hints` only when `view === "hints"` **or** `selected` is set (drawer open).
3. So the badge is not blank at launch, put a cheap count on `/api/tree`:
   - Cache `computeHints(...)` on the server `cache` object (same invalidation key as the model).
   - `/api/hints` returns that cached list (do not recompute every request).
   - `treePayload()` includes e.g. `hintBadge`: count of hints with `state` open or pinned, `isAncestor`, type `brick-wall` or `conflict` — same filter as `openHintCount` in `App.jsx`.
4. Tab badge reads `payload.hintBadge` until the full list is loaded, then the live count.

Do **not** send the full hint array inside `/api/tree`.

**Check:** first `/api/tree` after boot does **not** trigger `/api/hints`. Opening Hints or a person does. Badge still shows a number on launch if there are open ancestor brick-walls/conflicts. `setHome` / `setPrivacy` / `switchTree` already clear `hints` — keep that.

---

## Do not do in this chat

- Gzip / `Content-Encoding` in `send()` (localhost; adds CPU)
- Windowed / “visible only” `toF3()` (ChartView already windows the chart; `toF3()` is cheap on 229 people)
- Defer note bodies or slim confidence to score/tier
- Rebuild Hive layout / caps / pause-when-hidden (already done)
- Places map, particle names, hints-export (those are `NEXT.md` feature items)
- Publish / first commit / screenshots (separate; `QAQC.md` before any public commit)
- `0.0.0.0`, public/cloud upload, committing sidecars / `.gramps` / `notes/`
- Resume hung chats `48768c32`, `aeebeb6e`, `3c837bd7`, `6606ec58`, `f0c8fafd`, `80d8a9c9`, `3b8f0579`

---

## Verify (no Cursor browser MCP)

1. `npm run build` — confirm extra chunks; note main `index-*.js` size vs 1,969,152 bytes.
2. `curl -s http://127.0.0.1:5180/api/version` — `personal`, ~229 people.
3. `curl -s -o NUL -w "%{size_download}\n" http://127.0.0.1:5180/api/tree` — no `handleToId` in the JSON; size down vs queen.
4. DevTools or server log: `/api/hints` only after Hints tab or drawer.
5. Click-check in the **desktop Family Tree window** (not Cursor’s browser): pedigree first paint, hover peek kinship, Hints badge, drawer hints, then Fan / Hive once (lazy chunk).

If you need a sample to confirm payload slim / lazy Hive, switch the picker to British royal **after** My tree is the default — do not leave queen as `settings.json` treeId when you finish.

---

## Files you will likely touch

| File | Steps |
| --- | --- |
| `settings.json` (gitignored) | 1 |
| `src/App.jsx` | 2, 4, 5 |
| `server.mjs` | 3, 5 |

Leave `src/lib/hiveLayout.js`, `src/views/HiveView.jsx` internals, and parsers alone unless a strip/cache bug forces a one-line fix.

---

## When done

- Leave `settings.json` on **personal**.
- Do not commit unless asked.
- Update the work-hive board item `family-tree-viewer` when this slice is done.
- Feature work after this is `NEXT.md` item 6 (export pinned hints). Item 5 (two-surname / particle names) shipped 2026-09-19.
