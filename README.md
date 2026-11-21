# Decklist Printer

Build, edit, and print Vanguard proxy decks. Import a DeckLog deck, search the card database, add custom image cards, and create a print-ready PDF.

## Download

Choose the ZIP for your computer, extract it, and follow the included `START-HERE.txt`. No Node.js installation or setup is required.

| Platform | Download |
| --- | --- |
| Windows 10/11 (x64) | [Download DecklistPrinter-Windows.zip](https://github.com/cfthanh12/decklist-printer/releases/download/v1.0.0/DecklistPrinter-Windows.zip) |
| macOS (Apple Silicon and Intel) | [Download DecklistPrinter-Mac.zip](https://github.com/cfthanh12/decklist-printer/releases/download/v1.0.0/DecklistPrinter-Mac.zip) |
| Linux (x64) | [Download DecklistPrinter-Linux.zip](https://github.com/cfthanh12/decklist-printer/releases/download/v1.0.0/DecklistPrinter-Linux.zip) |

The app opens in your browser at `http://localhost:3000` (or the next available port). It needs an internet connection to load DeckLog decks and card images.

### First-launch notes

- The executables are unsigned. Windows may show SmartScreen; macOS may require right-clicking the app and choosing **Open** the first time.
- Your saved decks and custom images stay on your computer under `~/.decklist-printer/`.

## Features

- Import a public DeckLog deck by code or URL. Cards with the same name are combined.
- Search the official card database with filters, including nation and clan.
- Create and autosave decks locally, with no copy limit.
- Add custom cards using your own image.
- Export and import deck files, including custom images.
- Print an A4 PDF with nine 59 × 86 mm cards per page.

## Run from source

Requires Node.js.

```sh
npm install
npm start
```

## Build executables

Requires [Bun](https://bun.sh) in addition to Node.js.

```sh
npm run build:binaries
```

The executables are written to `dist/`.

## Printing

Print at 100% scale with **Fit to page** turned off.
