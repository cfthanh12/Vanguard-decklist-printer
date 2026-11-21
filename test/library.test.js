import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  dataDir,
  newId,
  listDecks,
  createDeck,
  getDeck,
  saveDeck,
  deleteDeck,
  storeCustomImage,
  readCustomImage,
  exportDeck,
  importDeck,
} from "../library.js";

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decklist-library-"));
  process.env.DECKLIST_DATA_DIR = tmpDir;
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DECKLIST_DATA_DIR;
});

test("dataDir and newId use the configured directory and UUIDs", () => {
  assert.equal(dataDir(), tmpDir);
  assert.equal(typeof newId(), "string");
  assert.notEqual(newId(), newId());
});

test("createDeck then listDecks returns one entry with the deck name", async () => {
  const deck = await createDeck("A");
  const decks = await listDecks();

  assert.equal(decks.length, 1);
  assert.equal(decks[0].name, "A");
  assert.equal(decks[0].id, deck.id);
});

test("saveDeck persists card counts and getDeck reloads them", async () => {
  const deck = await createDeck("B");
  await saveDeck({
    ...deck,
    cards: [
      {
        id: "c1",
        source: "db",
        card_number: "X",
        name: "N",
        picture: "a/b.png",
        count: 0,
      },
    ],
  });

  const reloaded = await getDeck(deck.id);
  assert.equal(reloaded.cards.length, 1);
  assert.equal(reloaded.cards[0].count, 0);
  assert.equal(reloaded.cards[0].source, "db");
  assert.equal(reloaded.cards[0].card_number, "X");
});

test("storeCustomImage then readCustomImage round-trips the bytes", async () => {
  const imagePath = await storeCustomImage(
    "d1",
    "c1",
    Buffer.from("abc"),
    "png"
  );

  assert.equal(imagePath, "images/d1/c1.png");
  assert.deepEqual(await readCustomImage(imagePath), Buffer.from("abc"));
});

test("exportDeck then importDeck restores custom images without imageData", async () => {
  const deck = await createDeck("C");
  const imagePath = await storeCustomImage(
    deck.id,
    "c1",
    Buffer.from("abc"),
    "png"
  );
  await saveDeck({
    ...deck,
    cards: [
      { id: "c1", source: "custom", name: "N", image: imagePath, count: 1 },
    ],
  });

  const payload = await exportDeck(await getDeck(deck.id));
  assert.match(payload.cards[0].imageData, /^data:image\/png;base64,/);

  const imported = await importDeck(payload);

  assert.notEqual(imported.id, deck.id);
  assert.notEqual(imported.cards[0].id, "c1");
  assert.ok(!("imageData" in imported.cards[0]));
  assert.equal(
    imported.cards[0].image,
    `images/${imported.id}/${imported.cards[0].id}.png`
  );
  assert.deepEqual(
    await readCustomImage(imported.cards[0].image),
    Buffer.from("abc")
  );
});

test("deleteDeck removes the deck and its image directory", async () => {
  const deck = await createDeck("D");
  await storeCustomImage(deck.id, "c1", Buffer.from("abc"), "png");

  await deleteDeck(deck.id);

  await assert.rejects(() => getDeck(deck.id), (error) => error.status === 404);
  const imagesDir = path.join(dataDir(), "images", deck.id);
  await assert.rejects(fs.promises.access(imagesDir));
  assert.deepEqual(
    (await listDecks()).filter((entry) => entry.id === deck.id),
    []
  );
});

test("readCustomImage rejects paths escaping the data directory", async () => {
  await assert.rejects(
    () => readCustomImage("../secrets.txt"),
    (error) => error.status === 400
  );
  await assert.rejects(
    () => readCustomImage("/etc/passwd"),
    (error) => error.status === 400
  );
});
