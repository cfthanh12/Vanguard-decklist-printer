# decklist-printer

Take a [DeckLog](https://decklog-en.bushiroad.com) deck and turn it into a print-ready PDF: A4, nine cards per page, 59 × 86 mm each, art upscaled to 450 dpi.

## Run from source

```sh
npm install
npm start
```

Opens http://localhost:3000. Paste a deck code (`6ZGG1`) or a deck URL.

Every card has a `−` / `+` stepper. Drop a 4-of to 2, or to 0 to leave it off the sheet. The card and page counts follow your numbers, and **Reset copies** puts the deck list back.

## Share it as a one-file app

Ready-to-send zips live in `dist/share/`:

| Zip | Contains |
| --- | --- |
| `DecklistPrinter-Windows.zip` | Windows 10/11 (x64) |
| `DecklistPrinter-Mac.zip` | macOS Apple silicon + Intel |
| `DecklistPrinter-Linux.zip` | Linux (x64) |

Upload the one matching your friend's computer to Google Drive and send the link. Each zip holds a self-contained executable plus `START-HERE.txt`: no Node, no installer, no setup. If you are not sure which they use, send the Windows one, it is the most common.

Rebuild them with `npm run build:binaries` (requires [Bun](https://bun.sh) once: `npm i -g bun`).

### Caveats worth knowing before you send it

- **Around 90–110 MB per file** (the Bun runtime is most of it). Zipped it is about half that.
- **Unsigned**, so Windows SmartScreen says "Windows protected your PC" (More info → Run anyway) and macOS needs right-click → Open the first time.
- **Needs internet**, because the deck and card art come from DeckLog and the official card database.
- The binary starts a local server on port 3000 (falls back to 3001–3019 if taken) and opens your browser.

## How it works

- Deck data: DeckLog's `POST /system/app/api/view/{code}` endpoint, which returns each card, its quantity, and the exact printing you picked.
- Card art: `en.cf-vanguard.com/wordpress/wp-content/images/cardlist/...`. Official art is 350 × 510 px, so the 3× upscale happens at print time. It sharpens edges; it cannot recover detail that is not in the source.
- Layout: A4 portrait, 3 × 3 grid, 5 mm gaps, centered. Landscape cards (ride deck crest) are rotated to keep their true size.

## Print

Print at 100% with "fit to page" turned off.
