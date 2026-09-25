# Family Tree — share with relatives

**In short:** on this computer, **Share view** writes a frozen, read-only folder. Living people are already labeled **Living**. Relatives do not install Node. If you host that folder, use Cloudflare Pages plus Access (an email allowlist), lock the door **before** you upload, and never put `tree.db` or a Gramps/GEDCOM file on GitHub. The steps below are the lock-then-upload path.

Two parts. **Part A** is what you send cousins. **Part B** is what you do on this computer.

Cousins do **not** install Node, Git, or the Family Tree desktop app. They open a link, type their email, and enter a one-time code.

Implementers: product rules stay in [SHARE.md](dev/SHARE.md). Daily-driver app: [USERGUIDE.md](USERGUIDE.md).

---

## Part A — for relatives (copy and send)

You do not install anything.

1. Open the link you were sent.
2. Type **your** email (the one on the invite list) and send the login code.
3. Check that inbox (and spam). The sender is Cloudflare. The code expires in about 10 minutes.
4. Enter the code. You should see the tree.
5. Use **Tree**, **Fan**, **Hive**, or **People**. **People** (or tap **Family Tree**) is the name list — type a name or scroll, then tap someone to center the tree there. On Tree, tap a card to re-center; parents / spouses / children chips also center.

Optional — that is the “app”:

- **iPhone:** Safari → Share → **Add to Home Screen**.
- **Android:** Chrome menu → **Add to Home screen**.

Living people show as **Living** (no name, dates, or photo). Do not screenshot those rows into a group chat.

If the site says the code was already used, tap **Request new code**. Some mail apps open the link before you do.

If you forward the link, the next person still needs an invited email. A random inbox will be denied.

---

## Part B — on your computer

### What Share view is

**Share view** writes a frozen, read-only mini website. It is not the desktop app on the internet. Relatives never talk to your local server.

A pack folder contains `index.html`, `tree.json`, portraits of deceased people, and a lite Tree / Fan / Hive viewer. Living people are already **Living**. There is no Edit and no “show living” button.

### Export a fresh pack

1. Double-click the **Family Tree** desktop icon (or `Open Family Tree.bat`).
2. In the Tree menu, pick **My tree (local)**.
3. Click **Share view** (or `Ctrl+K` → Share view).
4. A preview opens at `http://127.0.0.1:5180/share/`. Click Tree, Fan, Hive, and a few people. Confirm living rows say Living.
5. The new folder is named `share-YYYYMMDD-HHMMSS` under your research `data/exports/` directory.

Do **not** upload `share-20260920-172913`. That older folder was built before a path-leak fix. Always use a **new** Share view export after a rebuild.

When the tree changes: Share view again, then upload the **new** folder to the same website. Old folders can stay on disk.

### Security (read this before you host)

Already in every pack:

- Living names, dates, notes, citations, and photos become Living. Relationship slots stay (the fan does not get holes).
- “Living” is guessed from the file: a death date means deceased; birth less than 100 years ago and no death means living; an undated person with a recent child can count as living. If the file is wrong, the pack follows the **file**. Check the preview.
- The desktop **Living shown** button does not apply. Share view always redacts.
- `tree.db`, Gramps, local drive paths, and edit APIs are not in the pack.

What a hosted pack still is:

- After login, `tree.json` is a normal file. Anyone who can open the site can download deceased names, dates, notes, and portraits. Access is a **door**, not encryption.
- A password typed into the webpage is fake security. Do not add one.
- Do not put the pack, `tree.db`, or `settings.json` on GitHub, Facebook, or a public Pages URL.
- Do not change the desktop app to listen on the house Wi‑Fi (`0.0.0.0`). That would expose Edit and your files.
- If a cousin forwards the link, the next person still needs an invited inbox.

### Host — lock the door first, then upload

You will use a free Cloudflare account and **Pages Direct Upload** (drag the folder in the dashboard). Do **not** connect GitHub. Do **not** upload `tree.db`. There is no upload button inside the Family Tree app.

**Pages is public the moment files go up**, unless Access is on **both**:

- production: `your-project.pages.dev`
- previews: `*.your-project.pages.dev`

The dashboard button **Enable access policy** locks **previews only**. The live site needs one extra step (below). **Lock first. Upload second. Test in a private window before you text anyone.**

#### 1. Collect emails

Write down about 12 relative emails, plus yours.

#### 2. Create Cloudflare

1. Open [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Use **your** email. Confirm it.
3. Skip buying a domain. You do not need one.

#### 3. Turn on Zero Trust (free)

1. In the Cloudflare dashboard, open **Zero Trust**.
2. Create a free team. Use a boring name (not a family surname).
3. Stay on the free plan. About 12 people is fine.

#### 4. Turn on one-time PIN login

1. In Zero Trust, open identity providers (often **Integrations** → **Identity providers**).
2. Add **One-time PIN** if it is not already there.
3. Details: [One-time PIN login](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

If codes never arrive, ask relatives to allow `noreply@notify.cloudflare.com`.

#### 5. Create an empty Pages project (no files yet)

1. Go to **Workers & Pages** → **Create**.
2. Choose **Direct Upload**, not Git.
3. Name it something boring, e.g. `family-share` (not a surname).
4. Finish creating the project. Do **not** drop files yet.

#### 6. Lock Access before any family files

Follow Cloudflare’s Pages steps so **production** and **previews** are both gated: [Enable Access on your `*.pages.dev` domain](https://developers.cloudflare.com/pages/platform/known-issues/).

In short:

1. Open the Pages project → **Settings** → **Enable access policy** (this starts with previews).
2. **Manage** that Access application. Under the public hostname, remove the `*` wildcard so it covers `your-project.pages.dev` (you may need to rename the application). Save.
3. Return to the Pages project → **Settings** → **Enable access policy** again so previews (`*.your-project.pages.dev`) are also locked.
4. You should see **two** Access applications: one for the live site, one for previews.

On **both** applications, the Allow policy must be:

- **Include** → **Emails** → the list from step 1 (not “Everyone”).
- Login method: **One-time PIN**.
- Default is deny. Do not add a Bypass for everyone.

#### 7. Upload the pack

1. Export a **new** Share view pack (see above). Confirm the localhost preview.
2. Open that `share-…` folder.
3. In the Pages project, create a deployment and drag the **files inside** the folder — `index.html`, `tree.json`, `assets`, `media`, `share-meta.json` — not the `share-…` folder itself. If you upload the wrapper folder, the site will 404.
4. Save and deploy.

#### 8. Test before you text

Use a **private / incognito** window:

1. Open `https://your-project.pages.dev` with no login. You must see the Cloudflare email wall, **not** the tree.
2. Sign in with an invited email. PIN → tree. Living rows say Living.
3. Try an email that is **not** on the list. It must be denied.
4. Only then send the `https://….pages.dev` link plus **Part A**.

### After you change the tree

Share view again. Upload the **new** folder’s inner files to the **same** Pages project (replace production). You do not create a second website.

---

## What this is not

- Not the desktop Family Tree app on the internet.
- Not an App Store or Play Store install.
- Not a shared family password in a group text.
- Not something you commit to GitHub.
