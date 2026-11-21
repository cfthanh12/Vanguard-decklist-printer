#!/usr/bin/env bash
# Builds one-file executables for Windows, macOS and Linux.
# Requires Bun: https://bun.sh (installed with `npm i -g bun`).
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p dist

BUN="${BUN:-bun}"

build() {
  local target="$1" out="$2"
  echo "building $out"
  "$BUN" build --compile --minify --target="bun-$target" --outfile="dist/$out" desktop.js
}

build linux-x64 DecklistPrinter-Linux
build windows-x64 DecklistPrinter-Windows.exe
build darwin-arm64 DecklistPrinter-Mac-AppleSilicon
build darwin-x64 DecklistPrinter-Mac-Intel

chmod +x dist/DecklistPrinter-Linux dist/DecklistPrinter-Mac-AppleSilicon dist/DecklistPrinter-Mac-Intel
ls -lh dist
