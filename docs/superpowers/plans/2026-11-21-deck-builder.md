# Deck Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only DeckLog printer into a local deck builder: search the official card database, add/remove cards with no copy limit, add custom picture cards, persist decks locally, and print any of them.

**Architecture:** Split the monolith `app.js` into focused modules (constants/errors, DeckLog import, catalog proxy, image pipeline, deck storage library, PDF builder), then rewire `app.js` as a thin Express route layer. The browser talks only to the local server; the server proxies the CORS-locked official card API and reads/writes decks under `~/.decklist-printer/`.

**Tech Stack:** Node.js (ESM), Express 5, `pdf-lib`, `jimp`, `jpeg-js`, Node's built-in `node:test` runner. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-21-deck-builder-design.md`

## Global Constraints

- Card grid is 3 columns × 3 rows, 59 × 86 mm cards, 5 mm gaps, A4 (210 × 297 mm) portrait.
- Art is upscaled 3× and JPEG-encoded at quality 92; image fetch concurrency is 6.
- Custom images are contained and padded into the 59×86 cell; never stretched.
- No copy limits, no deck-size limits, no format legality checks.
- Persistence lives in `~/.decklist-printer/` (override with `DECKLIST_DATA_DIR`).
- A database card's `picture` may span multiple path segments (e.g. `pr/bcs/bcs2019_vgp01.png`).

## Review Focus

1. **A non-card-shaped custom image** (square or wide photo) must come out at 59×86 with white padding, not distorted. → Task 3.
2. **A deck with every card at count 0** must refuse to print. → Task 6.
3. **Export → import round-trip** must restore custom images byte-for-byte. → Task 4.
4. **A catalog `picture` with nested segments** (`pr/bcs/...`) must be accepted, while `..` path traversal is rejected. → Task 3.
5. **Removing the last copy of a card** removes the card entry from the deck entirely. → Task 4.

---

### Task 1: Shared constants and error type

**Files:**
- Create: `constants.js`
- Create: `errors.js`
- Modify: `package.json:8-12` (test script)
- Test: `test/constants.test.js`

**Interfaces:**
- Produces:
  - `constants.js` exports `DECKLOG_VIEW`, `IMAGE_BASE`, `CARD_CATALOG`, `USER_AGENT`, `PT`, `CARD_W_MM` (=59), `CARD_H_MM` (=86), `COLS` (=3), `ROWS` (=3), `GAP_MM` (=5), `PAGE_W_MM` (=210), `PAGE_H_MM` (=297), `UPSCALE` (=3), `JPEG_QUALITY` (=92), `IMAGE_CONCURRENCY` (=6).
  - `errors.js` exports `class HttpError extends Error { constructor(status, message) }` with `this.status` set.

- [ ] **Step 1: Write the failing test**

`test/constants.test.js` asserts: `CARD_W_MM === 59`, `CARD_H_MM === 86`, `COLS === 3`, `ROWS === 3`, `GAP_MM === 5`, `PAGE_W_MM === 210`, `PAGE_H_MM === 297`, `UPSCALE === 3`, `JPEG_QUALITY === 92`, `IMAGE_CONCURRENCY === 6`; and `new HttpError(409, "boom").status === 409`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../constants.js'`.

- [ ] **Step 3: Create `constants.js` and `errors.js` with the exact values above**

Move the literal values out of `app.js` (they currently sit at the top) into `constants.js`; move `HttpError` from `app.js` into `errors.js`. Do not yet delete anything from `app.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Point `package.json` test script at the runner and commit**

`package.json` `scripts.test` → `node --test`. Commit.

---

### Task 2: DeckLog import module

**Files:**
- Create: `decklog.js`
- Modify: `app.js:22-71` (replace inline functions with imports)
- Test: `test/decklog.test.js`

**Interfaces:**
- Consumes: `HttpError` (Task 1), `DECKLOG_VIEW`, `USER_AGENT` (Task 1).
- Produces (all exported from `decklog.js`):
  - `parseDeckCode(input) -> string` — accepts a bare code or a `/view/<code>` URL, uppercases, throws `HttpError(400, "Enter a DeckLog deck code or deck URL.")` on invalid input.
  - `fetchDeck(code, { fetchFn = fetch } = {}) -> Promise<object>` — POSTs to `DECKLOG_VIEW + encodeURIComponent(code)` with the existing headers; throws the existing `HttpError(502)` / `HttpError(404)`.
  - `deckCards(deck) -> Array<{ card_number, name, num, img, landscape }>` — merges `deck.p_list` and `deck.list`, skips entries with `num` 0 or no `img`, sets `landscape` from `width > height`.
  - `applyCounts(cards, counts) -> Array<card>` — returns cards with `num` clamped to `0..card.num` from `counts`; throws `HttpError(409)` on length mismatch, `HttpError(400)` on non-numeric count.

- [ ] **Step 1: Write the failing test**

`test/decklog.test.js`:
- `parseDeckCode("6ZGG1") === "6ZGG1"`; `parseDeckCode("https://decklog-en.bushiroad.com/view/6zgg1") === "6ZGG1"`; `parseDeckCode("!!")` throws with `status === 400`.
- `deckCards({ p_list: [{ num: 4, img: "a.png", card_number: "X", name: "N", width: 100, height: 140 }, { num: 0, img: "b.png" }], list: [{ num: 1, img: "c.png", card_number: "Y", width: 140, height: 100 }] })` returns 2 cards, the second has `landscape === true`, and the `num:0` entry is dropped.
- `applyCounts([{num:2},{num:3}], [0, 99])` returns `[{num:0},{num:3}]`; `applyCounts([{num:2}], [1,2])` throws `status === 409`; `applyCounts([{num:2}], ["x"])` throws `status === 400`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../decklog.js'`.

- [ ] **Step 3: Implement the four functions in `decklog.js`**

Port the existing bodies verbatim from `app.js`; parameterize `fetchDeck` with `{ fetchFn }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Replace `app.js`'s inline copies with imports**

Import `parseDeckCode`, `fetchDeck`, `deckCards`, `applyCounts` from `./decklog.js` and `HttpError` from `./errors.js`; delete the now-duplicate definitions. Run `npm test` (all pass) and commit.

---

### Task 3: Image pipeline (with widened path and custom contain+pad)

**Files:**
- Create: `images.js`
- Modify: `app.js` (remove `fetchImage`, `cardJpeg`, `mapLimit`, `IMAGE_PATH`)
- Test: `test/images.test.js`

**Interfaces:**
- Consumes: `IMAGE_BASE`, `USER_AGENT`, `UPSCALE`, `JPEG_QUALITY`, `CARD_W_MM`, `CARD_H_MM` (Task 1), `HttpError` (Task 1).
- Produces (all exported from `images.js`):
  - `IMAGE_PATH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.(png|jpe?g)$/`
  - `isValidImagePath(src) -> boolean` — `typeof src === "string"`, no `..`, matches `IMAGE_PATH`.
  - `fetchImage(src, { fetchFn = fetch } = {}) -> Promise<{ buffer, type }>` — existing behavior, but validate with `isValidImagePath`.
  - `cardJpeg(img) -> Promise<Buffer>` — existing DB-art path (rotate landscape, flatten, upscale 3×, encode quality 92).
  - `customCardJpeg(buffer) -> Promise<Buffer>` — read buffer, rotate landscape if needed, contain into a white 59×86 canvas, upscale 3×, encode quality 92.
  - `mapLimit(items, limit, fn)` — existing concurrency helper.

- [ ] **Step 1: Write the failing test**

`test/images.test.js`:
- `isValidImagePath("pr/bcs/bcs2019_vgp01.png") === true`; `isValidImagePath("bt01/bt01_012en.png") === true`; `isValidImagePath("../etc/passwd.png") === false`; `isValidImagePath("a.png") === false` (no directory segment).
- `customCardJpeg` on a generated 100×100 RGB image produces a JPEG whose decoded `width / height` is `59/86` within 0.01, and whose top-left corner pixel is white (padded).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../images.js'`.

- [ ] **Step 3: Implement `images.js`**

Port `fetchImage`, `cardJpeg`, `mapLimit` from `app.js` verbatim; change the path check to `isValidImagePath`. For `customCardJpeg`, follow the contain+pad recipe: decode with Jimp, rotate if `width > height`, scale to fit 59×86 preserving aspect, center on a white 59×86 background, then the same upscale/encode as `cardJpeg`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Remove duplicates from `app.js` and commit**

Import from `./images.js`; delete the inline definitions. `npm test` all green; commit.

---

### Task 4: Deck storage library

**Files:**
- Create: `library.js`
- Test: `test/library.test.js`

**Interfaces:**
- Consumes: none beyond Node stdlib.
- Produces (all exported from `library.js`), where `Deck = { id, name, createdAt, updatedAt, cards }` and a DB card is `{ id, source: "db", card_number, name, picture, count }` and a custom card is `{ id, source: "custom", name, image, count }`:
  - `dataDir() -> string` — `process.env.DECKLIST_DATA_DIR` or `path.join(os.homedir(), ".decklist-printer")`.
  - `newId() -> string` — `crypto.randomUUID()`.
  - `listDecks() -> Promise<Array<{ id, name, createdAt, updatedAt }>>`.
  - `createDeck(name) -> Promise<Deck>`.
  - `getDeck(id) -> Promise<Deck>` — throws `HttpError(404, "Deck not found.")`.
  - `saveDeck(deck) -> Promise<Deck>` — sets `updatedAt`, writes `decks/<id>.json`, upserts `decks.json`.
  - `deleteDeck(id) -> Promise<void>` — removes index entry, deck file, and `images/<id>/`.
  - `storeCustomImage(deckId, cardId, buffer, ext) -> Promise<string>` — writes `images/<deckId>/<cardId>.<ext>`, returns the relative path `images/<deckId>/<cardId>.<ext>`.
  - `readCustomImage(imagePath) -> Promise<Buffer>`.
  - `exportDeck(deck) -> Promise<object>` — deck with each custom card carrying an added `imageData` (base64 data URL) so the file is self-contained.
  - `importDeck(payload) -> Promise<Deck>` — re-store each custom card's `imageData`, assign fresh `id`s, drop `imageData`, return a saved deck.

- [ ] **Step 1: Write the failing test**

`test/library.test.js` sets `process.env.DECKLIST_DATA_DIR` to a `fs.mkdtempSync` dir in `before`, clears it in `after`:
- `createDeck("A")` then `listDecks()` returns one entry with `name === "A"`.
- `saveDeck({ ...deck, cards: [{ id:"c1", source:"db", card_number:"X", name:"N", picture:"a/b.png", count:0 }] })`, reload `getDeck`, assert count persisted.
- `storeCustomImage("d1","c1",Buffer.from("abc"),"png")` then `readCustomImage("images/d1/c1.png")` returns `Buffer.from("abc")`.
- `exportDeck(deckWithCustomImage)` then `importDeck(payload)` restores `readCustomImage` bytes and the card has no `imageData`.
- `deleteDeck("d1")` then `getDeck("d1")` throws `status === 404`, and the `images/d1` directory is gone.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../library.js'`.

- [ ] **Step 3: Implement `library.js`**

Plain `fs/promises` file I/O. `decks.json` is a JSON array. Use `newId()` for deck and card ids. Validate `imagePath` on `readCustomImage` so it stays under `dataDir()` (reject `..`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

---

### Task 5: Card catalog proxy

**Files:**
- Create: `catalog.js`
- Test: `test/catalog.test.js`

**Interfaces:**
- Consumes: `CARD_CATALOG`, `USER_AGENT` (Task 1), `HttpError` (Task 1).
- Produces (all exported from `catalog.js`):
  - `CATALOG_KEYS = ["keyword","nation","clan","grade","regulation","trigger","kind","rare","power_from","power_to","sort","page","per_page"]`
  - `sanitizeQuery(raw) -> object` — keep only `CATALOG_KEYS`, coerce `page`/`per_page` to integers with defaults `1`/`24`.
  - `mapCard(item) -> CardResult` — `{ card_number, name, picture, image, country, clan, grade, regulation, trigger, rare, power, shield, critical }`, where `name = item.card_name`, `image = "/api/image?src=" + encodeURIComponent(item.picture)`, `country = item.country`, `trigger = item.card_trigger`.
  - `searchCards(query, { fetchFn = fetch } = {}) -> Promise<{ total, page, per_page, nations, clans, items }>` — GET `CARD_CATALOG` with the sanitized query, `User-Agent`/`Referer` headers as the site uses, maps `items`, throws `HttpError(502, ...)` on network failure or non-2xx.

- [ ] **Step 1: Write the failing test**

`test/catalog.test.js`:
- `sanitizeQuery({ keyword: "Blaster", evil: "x", page: "3", per_page: "10" })` → `{ keyword: "Blaster", page: 3, per_page: 10 }` (no `evil`).
- `mapCard({ card_number:"X", card_name:"Blaster Blade", picture:"pr/bcs/a.png", country:"United Sanctuary", clan:"Royal Paladin", grade:"1", regulation:"V", card_trigger:"-", rare:"R", power:"10000", shield:"10000", critical:"1" })` returns `{ card_number:"X", name:"Blaster Blade", picture:"pr/bcs/a.png", image:"/api/image?src=pr%2Fbcs%2Fa.png", country:"United Sanctuary", ... }`.
- `searchCards({ keyword:"Blaster" }, { fetchFn })` with a fake `fetchFn` returning `Response.json({ total: 1, page: 1, per_page: 24, nations: [], clans: [], items: [ ...one item... ] })` returns `total === 1` and `items[0].name` mapped; a fake `fetchFn` returning `{ ok: false, status: 500 }` throws `status === 502`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../catalog.js'`.

- [ ] **Step 3: Implement `catalog.js`**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

---

### Task 6: PDF builder for an arbitrary card list

**Files:**
- Create: `pdf.js`
- Test: `test/pdf.test.js`

**Interfaces:**
- Consumes: `PT`, `CARD_W_MM`, `CARD_H_MM`, `COLS`, `ROWS`, `GAP_MM`, `PAGE_W_MM`, `PAGE_H_MM`, `IMAGE_CONCURRENCY` (Task 1), `HttpError` (Task 1), `cardJpeg`, `customCardJpeg`, `fetchImage`, `mapLimit` (Task 3), `readCustomImage` (Task 4).
- Produces:
  - `buildPdf({ title, cards, resolveImage = defaultResolveImage }) -> Promise<Uint8Array>` — `cards` is `Array<{ count, source, picture?, image? }>`; throws `HttpError(400, "No cards are selected to print.")` when no card has `count > 0`; otherwise returns PDF bytes laid out on the 3×3 grid with the same title/producer/filename conventions as today.
  - `defaultResolveImage(card) -> Promise<Buffer>` — DB card: `fetchImage(picture)` → `cardJpeg`; custom card: `readCustomImage(image)` → `customCardJpeg`.

- [ ] **Step 1: Write the failing test**

`test/pdf.test.js`:
- `buildPdf({ title:"t", cards: [{ count: 0, source:"db", picture:"x.png" }], resolveImage })` rejects with `status === 400`.
- `buildPdf({ title:"t", cards: [{ count: 9, source:"db", picture:"x.png" }], resolveImage: async () => <tiny valid jpeg Buffer> })` produces bytes that `PDFDocument.load` reads back with `1` page.
- Same but `count: 10` → `2` pages.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../pdf.js'`.

- [ ] **Step 3: Implement `pdf.js`**

Port the page/grid math and `PDFDocument` code from `app.js`'s `pdfHandler`, but accept the card list + injected `resolveImage`. Expand copies internally (`flatMap`), embed each unique resolved JPEG once.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

---

### Task 7: Rewire `app.js` routes

**Files:**
- Modify: `app.js` (full rewrite of `createApp`)
- Test: `test/app.test.js`

**Interfaces:**
- Consumes: all modules above.
- Produces:
  - `createApp({ html, fetchFn = fetch }) -> express app` with routes:
    - `GET /` — serves `html`.
    - `GET /api/deck?code=` — DeckLog import (existing response shape).
    - `GET /api/image?src=` — DB art (existing).
    - `GET /api/cards?...` — `searchCards(req.query, { fetchFn })`.
    - `GET /api/decks` — `{ decks: await listDecks() }`.
    - `POST /api/decks` (body `{ name }`) — `createDeck(name)`.
    - `GET /api/decks/:id` — `getDeck(id)`.
    - `PUT /api/decks/:id` (body = deck) — `saveDeck({ ...deck, id })`.
    - `DELETE /api/decks/:id` — `deleteDeck(id)`.
    - `POST /api/decks/:id/cards?name=` (raw image body) — `express.raw({ type: ["image/png","image/jpeg","image/webp"], limit: "25mb" })`, create a custom card with `storeCustomImage`, append, `saveDeck`.
    - `GET /api/deck-image/:deckId/:file` — serve `readCustomImage("images/<deckId>/<file>")`.
    - `GET /api/decks/:id/export` — `exportDeck` as a JSON download.
    - `POST /api/decks/import` (body = export payload) — `importDeck`.
    - `GET|POST /api/pdf` — `{ code, counts }` still works (fetch deck + `applyCounts`), and `{ title, cards }` works (call `buildPdf` directly).

- [ ] **Step 1: Write the failing test**

`test/app.test.js` starts `createApp({ html: "<h1>hi</h1>", fetchFn })` on an ephemeral port (`app.listen(0)`) with `DECKLIST_DATA_DIR` pointed at a temp dir, then uses `fetch` against `localhost:<port>`:
- `POST /api/decks {name:"A"}` → 200, body has `id` and `cards: []`.
- `GET /api/decks` → `decks.length === 1`.
- `GET /api/cards?keyword=Blaster` (with fake `fetchFn`) → 200, `items[0].name` mapped.
- `POST /api/pdf` with `{ title:"t", cards:[{count:1, source:"db", picture:"a/b.png"}] }` and a `fetchFn` that returns a valid image for the picture → 200, `content-type` starts `application/pdf`.
- `GET /` → 200 with `hi` in the body.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — the new routes are not present (404s).

- [ ] **Step 3: Rewrite `createApp` to wire the routes**

Keep the existing `/api/deck`, `/api/image`, and `/api/pdf` code path for `{ code, counts }`; add the deck-library, catalog, and card-list-PDF routes. Use a shared error handler that maps `HttpError.status`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

---

### Task 8: Frontend — deck library and autosave

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `/api/decks` list/create/get/put/delete routes (Task 7).
- Produces: UI state `let library = []`, `let currentDeck = null`, `let dirty = false`; functions `loadLibrary()`, `openDeck(id)`, `newDeck(name)`, `renameDeck(id, name)`, `duplicateDeck(id)`, `deleteDeck(id)`, `autosave()` (debounced ~500 ms, `PUT /api/decks/:id`), plus a "My decks" sidebar list and an autosave indicator ("Saved"/"Saving…").

- [ ] **Step 1: Add the "My decks" sidebar markup and styles**

A left rail listing deck names with New/Open/Rename/Duplicate/Delete controls, consistent with the existing `.panel`/`.chip` look.

- [ ] **Step 2: Wire load/create/open/rename/duplicate/delete against the API**

- [ ] **Step 3: Add autosave and the saved indicator**

Every mutation marks `dirty` and schedules `autosave()`; the indicator reflects the last save.

- [ ] **Step 4: Manual verification**

Run `npm start`; create a deck, add the title, reload the browser, confirm the deck is listed and reopening shows its contents; rename and delete behave. Then run `npm test` (all green) and commit.

---

### Task 9: Frontend — search pane, add/remove, custom card

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `/api/cards` and `/api/decks/:id/cards` routes (Task 7).
- Produces: search pane functions `search(query, filters)`, `loadMore()`, `renderResults()`; deck functions `addDbCard(cardResult)`, `setCount(index, n)` (unbounded `+`/`−`, no max), `removeCard(index)`; custom-card form `addCustomCard(file, name)` posting raw image bytes.

- [ ] **Step 1: Add the two-pane layout (search left, deck right)**

- [ ] **Step 2: Implement search with keyword + nation/clan/grade/regulation/trigger filters and "Load more"**

Nation/clan dropdowns are populated from the catalog response's `nations`/`clans`; grade/regulation/trigger are fixed lists (grade `0..4`, regulation `D/V/P/O`, trigger `Critical/Heal/Draw/Front/Stand/Over`).

- [ ] **Step 3: Implement add-to-deck, unbounded stepper, and remove**

`addDbCard` merges into an existing entry by `card_number` (increments `count`); `setCount` has no upper bound; `removeCard` deletes the entry (count 0 or the `✕`).

- [ ] **Step 4: Implement custom card add**

A file picker + name field; `fetch` with the file as the raw body and `name` in the query string; re-render the deck after the response.

- [ ] **Step 5: Manual verification**

Search "Blaster", add a card, add it again (count increments), step far past 4, remove it; add a non-card-shaped photo as a custom card and confirm it renders contained/padded; reload and confirm persistence. `npm test` green; commit.

---

### Task 10: Frontend — import, PDF, export/import files

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `/api/deck`, `/api/pdf`, `/api/decks/:id/export`, `/api/decks/import` (Task 7).
- Produces: `importDeckLog(code)` (creates a NEW saved deck named from the DeckLog title, never overwriting the open deck), `downloadPdf()` (POSTs `{ title, cards }` of the current deck), `exportDeckFile()`, `importDeckFile(file)`.

- [ ] **Step 1: Rework the existing "Load deck" field into `importDeckLog(code)`**

On success it calls `POST /api/decks { name: deck.title || code }` with the fetched cards mapped to DB card entries, then opens that new deck.

- [ ] **Step 2: Rework `download()` to post the current deck's cards instead of `{ code, counts }`**

- [ ] **Step 3: Add Export and Import file buttons**

Export triggers a download of `/api/decks/:id/export`; import reads a selected file and POSTs it to `/api/decks/import`, then opens the returned deck.

- [ ] **Step 4: End-to-end manual verification + docs**

Full flow: import `6ZGG1` → it becomes a named saved deck; edit copies; add a custom photo card; download the PDF and confirm custom cards are on the sheet; export the deck file, import it on a fresh browser session, confirm the custom image survived. Update `README.md` to describe the builder and local saves. `npm test` green; commit.

---

## Self-Review Notes

- **Spec coverage:** search/filters (Task 5, 9), add/remove with no limits (Task 4, 9), custom picture cards (Tasks 3, 4, 9), local save + deck library (Tasks 4, 8), DeckLog import (Task 2, 10), PDF of any deck (Task 6, 7, 10), export/import (Task 4, 10). No spec requirement is unaddressed.
- **Type consistency:** `Deck`, DB card, custom card shapes are pinned once in Task 4 and reused verbatim in Tasks 7–10; `buildPdf` card shape `{ count, source, picture?, image? }` matches what Task 7/10 build.
- **Review Focus:** all five lines are pinned to a task's test (Tasks 3, 6, 4, 3, 4 respectively).
- **Proportion:** plan states signatures, exact values, and test assertions; it does not reproduce function bodies except where the spec fixes copy (error strings) or the algorithm is not obvious (custom contain+pad).
