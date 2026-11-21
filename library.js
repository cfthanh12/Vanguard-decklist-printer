import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { HttpError } from "./errors.js";

const INDEX_FILE = "decks.json";
const DECKS_DIR = "decks";
const IMAGES_DIR = "images";

export function dataDir() {
  return process.env.DECKLIST_DATA_DIR || path.join(os.homedir(), ".decklist-printer");
}

export function newId() {
  return randomUUID();
}

function indexPath() {
  return path.join(dataDir(), INDEX_FILE);
}

function deckPath(id) {
  return path.join(dataDir(), DECKS_DIR, `${id}.json`);
}

function imagesDir(deckId) {
  return path.join(dataDir(), IMAGES_DIR, deckId);
}

export async function listDecks() {
  try {
    const raw = await fs.readFile(indexPath(), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function createDeck(name) {
  const now = new Date().toISOString();
  const deck = { id: newId(), name, createdAt: now, updatedAt: now, cards: [] };
  await saveDeck(deck);
  return deck;
}

export async function getDeck(id) {
  try {
    const raw = await fs.readFile(deckPath(id), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") throw new HttpError(404, "Deck not found.");
    throw error;
  }
}

export async function saveDeck(deck) {
  deck.updatedAt = new Date().toISOString();

  const dir = path.join(dataDir(), DECKS_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(deckPath(deck.id), JSON.stringify(deck, null, 2));

  const decks = await listDecks();
  const index = decks.findIndex((entry) => entry.id === deck.id);
  const entry =
    index === -1
      ? {
          id: deck.id,
          name: deck.name,
          createdAt: deck.createdAt,
          updatedAt: deck.updatedAt,
        }
      : {
          ...decks[index],
          name: deck.name,
          updatedAt: deck.updatedAt,
        };

  if (index === -1) decks.push(entry);
  else decks[index] = entry;

  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(indexPath(), JSON.stringify(decks, null, 2));
  return deck;
}

export async function deleteDeck(id) {
  const decks = await listDecks();
  const next = decks.filter((entry) => entry.id !== id);
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(indexPath(), JSON.stringify(next, null, 2));

  await fs.rm(deckPath(id), { force: true });
  await fs.rm(imagesDir(id), { recursive: true, force: true });
}

export async function storeCustomImage(deckId, cardId, buffer, ext) {
  const dir = imagesDir(deckId);
  await fs.mkdir(dir, { recursive: true });
  const imagePath = path.posix.join(IMAGES_DIR, deckId, `${cardId}.${ext}`);
  await fs.writeFile(path.join(dataDir(), imagePath), buffer);
  return imagePath;
}

export async function readCustomImage(imagePath) {
  const root = path.resolve(dataDir());
  if (
    typeof imagePath !== "string" ||
    path.isAbsolute(imagePath) ||
    imagePath.includes("..")
  ) {
    throw new HttpError(400, "Invalid custom image path.");
  }

  const target = path.resolve(root, imagePath);
  if (!target.startsWith(root + path.sep)) {
    throw new HttpError(400, "Invalid custom image path.");
  }

  return fs.readFile(target);
}

function mimeForExt(ext) {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function extForMime(mime) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

function decodeImageData(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new HttpError(400, "Invalid image data.");
  return {
    buffer: Buffer.from(match[2], "base64"),
    ext: extForMime(match[1]),
  };
}

export async function exportDeck(deck) {
  const cards = [];
  for (const card of deck.cards) {
    if (card.source === "custom" && card.image) {
      const bytes = await readCustomImage(card.image);
      const ext = path.extname(card.image).replace(/^\./, "").toLowerCase();
      cards.push({
        ...card,
        imageData: `data:${mimeForExt(ext)};base64,${bytes.toString("base64")}`,
      });
    } else {
      cards.push(card);
    }
  }
  return { ...deck, cards };
}

export async function importDeck(payload) {
  const deckId = newId();
  const now = new Date().toISOString();
  const cards = [];

  for (const card of payload.cards || []) {
    const { imageData, ...rest } = card;
    if (card.source === "custom" && imageData) {
      const { buffer, ext } = decodeImageData(imageData);
      const cardId = newId();
      const image = await storeCustomImage(deckId, cardId, buffer, ext);
      cards.push({ ...rest, id: cardId, image });
    } else {
      cards.push({ ...rest, id: newId() });
    }
  }

  const deck = {
    id: deckId,
    name: payload.name,
    createdAt: now,
    updatedAt: now,
    cards,
  };
  await saveDeck(deck);
  return deck;
}
