import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Jimp } from "jimp";
import { PDFDocument } from "pdf-lib";

import { createApp } from "../app.js";
import { DECKLOG_VIEW, CARD_CATALOG, IMAGE_BASE } from "../constants.js";

let tmpDir;
let server;
let base;
let pngBytes;

const tinyPng = async () => {
  const image = new Jimp({ width: 20, height: 30, color: 0x336699ff });
  return image.getBuffer("image/png");
};

function listen(app) {
  return new Promise((resolve, reject) => {
    const s = app.listen(0);
    s.once("listening", () => resolve(s));
    s.once("error", reject);
  });
}

const fakeFetch = async (url) => {
  if (url.startsWith(DECKLOG_VIEW)) {
    return Response.json({
      id: "6ZGG1",
      title: "Test Deck",
      deck_param1: "D",
      deck_param2: "Dragon Empire",
      p_list: [
        {
          num: 4,
          img: "bt01/bt01_001en.png",
          card_number: "BT01/001EN",
          name: "Blaster Blade",
          width: 100,
          height: 140,
        },
      ],
      list: [],
    });
  }
  if (url.startsWith(CARD_CATALOG)) {
    return Response.json({
      total: 1,
      page: 1,
      per_page: 24,
      nations: [],
      clans: [],
      items: [
        {
          card_number: "BT01/001EN",
          card_name: "Blaster Blade",
          picture: "bt01/bt01_001en.png",
          country: "United Sanctuary",
          clan: "Royal Paladin",
          grade: "1",
          regulation: "D",
          card_trigger: "-",
          rare: "R",
          power: "10000",
          shield: "10000",
          critical: "1",
        },
      ],
    });
  }
  if (url.startsWith(IMAGE_BASE)) {
    return new Response(pngBytes, { headers: { "Content-Type": "image/png" } });
  }
  throw new Error(`Unexpected fetch: ${url}`);
};

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decklist-app-"));
  process.env.DECKLIST_DATA_DIR = tmpDir;
  pngBytes = await tinyPng();
  server = await listen(createApp({ html: "<h1>hi</h1>", fetchFn: fakeFetch }));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DECKLIST_DATA_DIR;
});

test("GET / serves the provided HTML", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /hi/);
});

test("deck list is beside search and the custom-card form stays compact", () => {
  const html = fs.readFileSync(path.join(process.cwd(), "public/index.html"), "utf8");
  assert.match(html, /\.custom-form\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)\s+auto;/s);
  assert.match(html, /\.custom-form \.btn\s*\{[^}]*height:\s*38px;[^}]*padding:\s*0 12px;/s);
  assert.match(html, /\.result-grid\s*\{[^}]*max-height:\s*[^;]+;[^}]*overflow-y:\s*auto;/s);
  assert.match(html, /id="search-sentinel"/);
  assert.doesNotMatch(html, /load-more/);
  assert.match(html, /new IntersectionObserver/);
  assert.match(html, /root:\s*searchResults/);
  assert.match(html, /if \(!searchHasMore \|\| searchLoading\) return;/);
  assert.match(html, /\.search-form\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
  assert.match(html, /\.search-filters\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s);
  const searchForm = html.indexOf('<form id="search-form">');
  const keyword = html.indexOf('id="search-keyword"', searchForm);
  const nation = html.indexOf('id="filter-nation"', searchForm);
  const clan = html.indexOf('id="filter-clan"', searchForm);
  assert.ok(keyword >= 0 && nation > keyword && clan > nation);
  const deckPane = html.indexOf('class="deck-pane"');
  const sheets = html.indexOf('<section class="sheets" id="sheets"');
  const searchPane = html.indexOf('class="search-pane"');
  assert.ok(deckPane >= 0 && sheets > deckPane && searchPane > sheets,
    "deck list should be in the left pane before the search pane on the right");
});

test("POST /api/decks creates a deck with an id and empty cards", async () => {
  const res = await fetch(`${base}/api/decks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "A" }),
  });
  assert.equal(res.status, 200);
  const deck = await res.json();
  assert.equal(typeof deck.id, "string");
  assert.ok(deck.id.length > 0);
  assert.deepEqual(deck.cards, []);
});

test("GET /api/decks lists the created deck", async () => {
  const res = await fetch(`${base}/api/decks`);
  assert.equal(res.status, 200);
  const { decks } = await res.json();
  assert.equal(decks.length, 1);
  assert.equal(decks[0].name, "A");
});

test("GET /api/cards proxies the catalog search", async () => {
  const res = await fetch(`${base}/api/cards?keyword=Blaster`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.items[0].name, "Blaster Blade");
});

test("POST /api/pdf builds a PDF from a title and card list", async () => {
  const res = await fetch(`${base}/api/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "t",
      cards: [{ count: 1, source: "db", picture: "a/b.png" }],
    }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^application\/pdf/);
  const bytes = Buffer.from(await res.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
});

test("POST /api/pdf still builds a PDF from a DeckLog code and counts", async () => {
  const res = await fetch(`${base}/api/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "6ZGG1", counts: [2] }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^application\/pdf/);
  const bytes = Buffer.from(await res.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getTitle(), "Test Deck (6ZGG1)");
  assert.equal(pdf.getPageCount(), 1);
});

test("GET/PUT/DELETE deck routes manage a deck", async () => {
  const createRes = await fetch(`${base}/api/decks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Editable" }),
  });
  const created = await createRes.json();

  const getRes = await fetch(`${base}/api/decks/${created.id}`);
  assert.equal(getRes.status, 200);
  assert.equal((await getRes.json()).name, "Editable");

  const putRes = await fetch(`${base}/api/decks/${created.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...created, name: "Renamed" }),
  });
  assert.equal(putRes.status, 200);
  assert.equal((await putRes.json()).name, "Renamed");

  const reloaded = await (
    await fetch(`${base}/api/decks/${created.id}`)
  ).json();
  assert.equal(reloaded.name, "Renamed");

  const delRes = await fetch(`${base}/api/decks/${created.id}`, {
    method: "DELETE",
  });
  assert.equal(delRes.status, 200);

  const missingRes = await fetch(`${base}/api/decks/${created.id}`);
  assert.equal(missingRes.status, 404);
});

test("deck export/import round-trips a custom image through the API", async () => {
  const createRes = await fetch(`${base}/api/decks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Roundtrip" }),
  });
  const deck = await createRes.json();

  const addRes = await fetch(
    `${base}/api/decks/${deck.id}/cards?name=Custom`,
    {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: pngBytes,
    }
  );
  assert.equal(addRes.status, 200);
  const withCard = await addRes.json();
  assert.equal(withCard.cards.length, 1);
  assert.equal(withCard.cards[0].source, "custom");
  assert.equal(withCard.cards[0].name, "Custom");
  assert.equal(withCard.cards[0].count, 1);
  assert.match(withCard.cards[0].image, /^images\/.+\/.+\.png$/);

  const served = await fetch(
    `${base}/api/deck-image/${deck.id}/${withCard.cards[0].id}.png`
  );
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), pngBytes);

  const exportRes = await fetch(`${base}/api/decks/${deck.id}/export`);
  assert.equal(exportRes.status, 200);
  assert.match(exportRes.headers.get("content-disposition") || "", /^attachment/);
  const payload = await exportRes.json();
  assert.match(payload.cards[0].imageData, /^data:image\/png;base64,/);

  const importRes = await fetch(`${base}/api/decks/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(importRes.status, 200);
  const imported = await importRes.json();
  assert.equal(imported.name, "Roundtrip");
  assert.equal(imported.cards.length, 1);
  assert.equal(imported.cards[0].source, "custom");
  assert.ok(!("imageData" in imported.cards[0]));
  assert.equal(
    imported.cards[0].image,
    `images/${imported.id}/${imported.cards[0].id}.png`
  );
});
