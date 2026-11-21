# Deck Builder — Design

## Intent

The app today is read-only: paste a DeckLog code, trim copies with −/+, print an A4 PDF.
The owner wants to build decks locally instead: search the official card database, add or
remove cards freely, drop in custom cards that are a picture they supply, keep decklists on
this machine, and print the result.

It is a local, single-user tool. No account, no cloud, no sharing service.

## Goals

- Search the official card database with DeckLog-style filters and add cards to a deck.
- Add or remove cards with no copy limit (the owner explicitly wants no limits).
- Add a custom card that is a name plus a picture the owner supplies.
- Save decklists locally so closing the window does not lose them.
- Import a DeckLog code as a starting point, then edit it like any deck. Importing while a
  deck is open always creates a new saved deck named from the DeckLog title; the open deck is
  untouched.
- Print the current deck to the same A4 3×3 proxy PDF.

## Non-goals

- No deck-format legality checks, no deck size limits, no copy limits.
- No DeckLog account, login, or publishing.
- No multi-user or hosted sharing.

## Anti-goals

- Anything that blocks an arbitrary proxy deck from printing. The tool must not refuse a
  deck because it is "illegal" or "too many copies". It only fails when it cannot render.

## Constraints

- The official card API (`https://en.cf-vanguard.com/manage/en-api/cards`) is CORS-locked to
  the official site, so the browser cannot call it directly. The existing local server must
  proxy it. It returns 26,461 cards, paginated (`page`, `per_page`), filtered by `keyword`,
  `nation`, `clan`, `grade`, `regulation`, `trigger`, `kind`, `rare`, `power_from`,
  `power_to`, `sort`. Each item carries `card_number`, `card_name`, `country`, `clan`,
  `grade`, `regulation`, `card_trigger`, `picture`, and more.
- Catalog art is served from `https://en.cf-vanguard.com/wordpress/wp-content/images/cardlist/<picture>`.
  `picture` values can span multiple path segments (e.g. `pr/bcs/bcs2019_vgp01.png`), which
  the current single-slash `IMAGE_PATH` regex in `app.js` rejects. That regex must be widened.
- The app is distributed as a one-file executable (`desktop.js`, compiled by
  `scripts/build-binaries.sh`). Persistence must therefore live in the user's home
  directory, not next to the binary.

## Approaches

- **A. Server-backed deck library (chosen).** The local server stores decks as JSON files
  under `~/.decklist-printer/`, autosaves on every change, and serves a small "My decks"
  list (New, Open, Rename, Duplicate, Delete). Custom images are stored alongside decks.
  Also supports export/import of a deck file for one-file handoff.
- **B. Manual save/open files.** A "Save deck" button writes a file; "Open" reads it back.
  No autosave, no deck list. Rejected: more moving parts for no real gain once the server
  already exists, and loses work on close.

Chosen: **A**, with deck-file export kept for handoff. Export is a single `.json` file with
custom images embedded as base64, so one file hands off cleanly.

## The build

### Storage

Data directory `~/.decklist-printer/` (overridable via `DECKLIST_DATA_DIR` for tests):

- `decks.json` — an array of `{ id, name, createdAt, updatedAt }`.
- `decks/<id>.json` — one deck.
- `images/<deckId>/<cardId>.<ext>` — custom card images.

A deck record:

```json
{
  "id": "uuid",
  "name": "Deck name",
  "createdAt": "2026-11-21T00:00:00.000Z",
  "updatedAt": "2026-11-21T00:00:00.000Z",
  "cards": [
    { "id": "uuid", "source": "db", "card_number": "BT01/012EN", "name": "Future Knight, Llew", "picture": "bt01/bt01_012en.png", "count": 4 },
    { "id": "uuid", "source": "custom", "name": "My proxy", "image": "images/<deckId>/<cardId>.png", "count": 1 }
  ]
}
```

Adding a database card already in the deck increments its `count`. A card at count 0 is
removed. There is no upper bound.

### Server (`app.js`)

New routes:

- `GET /api/cards` — proxy to the official `cards` endpoint. Whitelist the query params
  above, add the same `User-Agent`/`Referer` the app already uses, map each result to
  `{ card_number, name, picture, image, ...filterFields }`, return `total` plus the current
  page so the UI can "Load more".
- `GET /api/decks` — list decks from `decks.json`.
- `POST /api/decks` — create a deck `{ name }`.
- `GET /api/decks/:id` — full deck.
- `PUT /api/decks/:id` — replace the deck (autosave), updates `updatedAt`.
- `DELETE /api/decks/:id` — delete the deck and its custom images.
- `POST /api/decks/:id/cards` — upload a custom card image (multipart), store it under
  `images/`, return the card `{ id, name, image }`. The owner supplies a name and a picture.
- `GET /api/deck-image/<deckId>/<cardId>` — serve a stored custom image (and its thumbnail
  use). No external fetch.
- `GET /api/decks/:id/export` — the deck as one `.json` file with custom images embedded as
  base64.
- `POST /api/decks/import` — accept that same file and create a deck from it.

Changed route:

- `POST /api/pdf` — currently takes `{ code, counts }` and re-fetches DeckLog. Extend it to
  accept a deck payload (`{ name, cards: [...] }`) and build the PDF from that card list
  directly. Each card names an image source: a database `picture` (fetched as today) or a
  local custom image (read from disk). Both go through the same resize/rotate/upscale path.
  Keep the existing `code` path for backward-compatible import printing.

### Frontend (`public/index.html`)

Two-pane layout once a deck is open:

- **Search pane (left).** A keyword box plus DeckLog-style filters (nation, clan, grade,
  regulation, trigger), a results grid of card art with a `+` per card, and "Load more".
- **Deck pane (right).** The deck name, total count, each card with an unbounded `+`/`−`
  stepper and a `✕` to remove, "Add custom card" (name + file picker), "Download PDF", and
  an autosave indicator. A "My decks" list lets the owner switch between saved decks.
- **Import stays.** The existing code field loads the DeckLog contents into a new saved deck
  named from the DeckLog title (no open-deck overwrite).
- Custom card art is contained and padded into the 59×86 cell (white bars for non-card shapes),
  never stretched.
- Custom cards are edited by delete-and-re-add in this version; no separate rename or
  replace-picture UI.
- Search filter dropdowns: nation and clan options come from the official API's own lists on
  first load; grade, regulation, and trigger are short fixed lists.

## Left to the builder

- Exact API request/response shapes and error handling.
- File layout and validation for the storage format above.
- How the PDF pipeline is refactored so `db` and `custom` image sources share one code path.
- Concurrency/limits on image upload and any max request body size.
- Test strategy (the project currently has no tests; add focused ones around parsing, storage
  round-trips, and PDF card-list handling without requiring the network).
