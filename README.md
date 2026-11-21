# Decklist Printer

Need a printable proxy deck? Paste in a DeckLog code, make any changes you want, and print it as a PDF. You can also build a deck from the card search or add your own card images.

## Download

Pick the ZIP for your computer:

- [Windows 10/11 (64-bit)](https://github.com/cfthanh12/decklist-printer/releases/download/v1.0.0/DecklistPrinter-Windows.zip)
- [macOS (Apple Silicon or Intel)](https://github.com/cfthanh12/decklist-printer/releases/download/v1.0.0/DecklistPrinter-Mac.zip)
- [Linux (64-bit)](https://github.com/cfthanh12/decklist-printer/releases/download/v1.0.0/DecklistPrinter-Linux.zip)

After downloading, unzip the file and open `START-HERE.txt`. You don't need to install Node.js or anything else. The app opens in your browser and runs locally on your computer.

The app needs an internet connection for DeckLog imports and card images. The downloads are unsigned, so Windows or macOS may show a security warning the first time you open one.

## What you can do

- Import a deck from a public DeckLog code or URL. Cards with the same name are combined.
- Search the card database, filter by nation or clan, and add cards without a copy limit.
- Save decks on your computer, add custom images, or export a deck to share it.
- Make an A4 PDF with nine 59 × 86 mm cards per page.

Your saved decks and custom images stay on your computer in `~/.decklist-printer/`.

## Run from source

If you're working on the app, install the dependencies and start the local server:

```sh
npm install
npm start
```

To build the platform executables, install [Bun](https://bun.sh) and run:

```sh
npm run build:binaries
```

The executables are written to `dist/`.

## Printing

For cards to print at the right size, print at 100% and turn off **Fit to page**.
