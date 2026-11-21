# decklist-printer

Build and print proxy decks locally. Search the official card database, edit a deck with unlimited copies, add custom picture cards, and turn it into a print-ready PDF: A4, nine cards per page, 59 × 86 mm each, art upscaled to 450 dpi.

## Run from source

```sh
npm install
npm start
```

Opens http://localhost:3000. Use **My decks** to create, open, rename, duplicate, or delete saved decks.

Search the official database with filters, add cards to the open deck, and use each card's `−` / `+` stepper. Counts have no upper limit; use `×` or reduce to zero to remove a card. You can also add a custom card from a name and image file.

Paste a [DeckLog](https://decklog-en.bushiroad.com) deck code (`6ZGG1`) or URL to import it as a new saved deck. Deck changes autosave locally. **Export deck** downloads a one-file JSON handoff with custom images embedded; **Import deck file** restores it as a new saved deck.

## Share it as a one-file app

Ready-to-send zips live in `dist/share/`:

| Zip | Contains |
| --- | --- |
| [DecklistPrinter-Windows.zip](https://github.com/cfthanh12/decklist-printer/releases/download/v1.0.0/DecklistPrinter-Windows.zip) | Windows 10/11 (x64) |
| [DecklistPrinter-Mac.zip](https://github.com/cfthanh12/decklist-printer/releases/download/v1.0.0/DecklistPrinter-Mac.zip) | macOS Apple silicon + Intel |
| [DecklistPrinter-Linux.zip](https://github.com/cfthanh12/decklist-printer/releases/download/v1.0.0/DecklistPrinter-Linux.zip) | Linux (x64) |

Download the zip for your computer. Each one contains a self-contained executable plus `START-HERE.txt`: no Node, no installer, no setup. If you are not sure which one you need, choose Windows.

Rebuild them with `npm run build:binaries` (requires [Bun](https://bun.sh) once: `npm i -g bun`).

### Caveats worth knowing before you send it

- **Around 90–110 MB per file** (the Bun runtime is most of it). Zipped it is about half that.
- **Unsigned**, so Windows SmartScreen says "Windows protected your PC" (More info → Run anyway) and macOS needs right-click → Open the first time.
- **Needs internet**, because the deck and card art come from DeckLog and the official card database.
- The binary starts a local server on port 3000 (falls back to 3001–3019 if taken) and opens your browser.

## How it works

- Deck data: DeckLog's `POST /system/app/api/view/{code}` endpoint, which returns each card, its quantity, and the exact printing you picked.
- Saved data: deck JSON and custom images are stored under `~/.decklist-printer/` (`DECKLIST_DATA_DIR` overrides this for tests or portable setups).
- Card art: `en.cf-vanguard.com/wordpress/wp-content/images/cardlist/...`. Official art is 350 × 510 px, so the 3× upscale happens at print time. It sharpens edges; it cannot recover detail that is not in the source.
- Layout: A4 portrait, 3 × 3 grid, 5 mm gaps, centered. Landscape cards (ride deck crest) are rotated to keep their true size.

## Print

Print at 100% with "fit to page" turned off.
