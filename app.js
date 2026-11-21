import express from "express";
import { PDFDocument } from "pdf-lib";
import { Jimp, ResizeStrategy } from "jimp";
import jpeg from "jpeg-js";

import { parseDeckCode, fetchDeck, deckCards, applyCounts } from "./decklog.js";
import { HttpError } from "./errors.js";

const DECKLOG_VIEW = "https://decklog-en.bushiroad.com/system/app/api/view/";
const IMAGE_BASE = "https://en.cf-vanguard.com/wordpress/wp-content/images/cardlist/";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PT = 72 / 25.4;
const CARD_W_MM = 59;
const CARD_H_MM = 86;
const COLS = 3;
const ROWS = 3;
const GAP_MM = 5;
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const UPSCALE = 3;
const JPEG_QUALITY = 92;
const IMAGE_CONCURRENCY = 6;
const IMAGE_PATH = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.(png|jpe?g)$/;

const imageCache = new Map();
const rawCache = new Map();

async function fetchImage(img) {
  const cached = rawCache.get(img);
  if (cached) return cached;

  if (!IMAGE_PATH.test(img)) throw new HttpError(400, "Invalid card image path.");

  const url = IMAGE_BASE + img.split("/").map(encodeURIComponent).join("/");
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Referer: "https://en.cf-vanguard.com/cardlist/" },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpError(502, "Could not reach the card database. Check your internet connection.");
  }
  if (!res.ok) throw new HttpError(502, `Card image failed: ${img} (${res.status}).`);

  const entry = {
    buffer: Buffer.from(await res.arrayBuffer()),
    type: res.headers.get("content-type") || "image/png",
  };
  rawCache.set(img, entry);
  return entry;
}

async function cardJpeg(card) {
  const cached = imageCache.get(card.img);
  if (cached) return cached;

  const { buffer: source } = await fetchImage(card.img);
  const art = await Jimp.read(source);
  if (art.bitmap.width > art.bitmap.height) art.rotate(90);

  const flat = new Jimp({
    width: art.bitmap.width,
    height: art.bitmap.height,
    color: 0xffffffff,
  }).composite(art, 0, 0);

  flat.resize({
    w: Math.round(art.bitmap.width * UPSCALE),
    h: Math.round(art.bitmap.height * UPSCALE),
    mode: ResizeStrategy.BICUBIC,
  });

  const { data, width, height } = flat.bitmap;
  const encoded = jpeg.encode({ data, width, height }, JPEG_QUALITY).data;
  imageCache.set(card.img, encoded);
  return encoded;
}

async function mapLimit(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

export function createApp({ html }) {
  const app = express();

  app.get("/", (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  });

  app.get("/api/deck", async (req, res) => {
    try {
      const code = parseDeckCode(req.query.code);
      const deck = await fetchDeck(code);
      const cards = deckCards(deck);
      const total = cards.reduce((sum, card) => sum + card.num, 0);
      res.json({
        code,
        title: deck.title || "",
        regulation: deck.deck_param1 || "",
        nation: deck.deck_param2 || "",
        total,
        pages: Math.ceil(total / (COLS * ROWS)),
        cards: cards.map((card) => ({
          ...card,
          image: "/api/image?src=" + encodeURIComponent(card.img),
        })),
      });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Something went wrong." });
    }
  });

  app.get("/api/image", async (req, res) => {
    try {
      const { buffer, type } = await fetchImage(String(req.query.src || ""));
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(buffer);
    } catch (error) {
      res.status(error.status || 502).json({ error: error.message || "Image could not be loaded." });
    }
  });

  const pdfHandler = async (req, res) => {
    try {
      const body = req.body || {};
      const code = parseDeckCode(body.code ?? req.query.code);
      const deck = await fetchDeck(code);
      const cards = applyCounts(deckCards(deck), body.counts);
      if (!cards.some((card) => card.num > 0)) {
        throw new HttpError(400, "No cards are selected to print.");
      }

      const printable = cards.filter((card) => card.num > 0);
      const unique = new Map(printable.map((card) => [card.img, card]));
      await mapLimit([...unique.values()], IMAGE_CONCURRENCY, cardJpeg);

      const pdf = await PDFDocument.create();
      pdf.setTitle(deck.title ? `${deck.title} (${code})` : code);
      pdf.setProducer("decklist-printer");

      const embedded = new Map();
      for (const img of unique.keys()) {
        embedded.set(img, await pdf.embedJpg(imageCache.get(img)));
      }

      const copies = printable.flatMap((card) => Array.from({ length: card.num }, () => card));
      const perPage = COLS * ROWS;
      const gridW = COLS * CARD_W_MM + (COLS - 1) * GAP_MM;
      const gridH = ROWS * CARD_H_MM + (ROWS - 1) * GAP_MM;
      const originX = (PAGE_W_MM - gridW) / 2;
      const originY = (PAGE_H_MM - gridH) / 2;

      for (let i = 0; i < copies.length; i += perPage) {
        const page = pdf.addPage([PAGE_W_MM * PT, PAGE_H_MM * PT]);
        copies.slice(i, i + perPage).forEach((card, index) => {
          const col = index % COLS;
          const row = Math.floor(index / COLS);
          page.drawImage(embedded.get(card.img), {
            x: (originX + col * (CARD_W_MM + GAP_MM)) * PT,
            y: (originY + gridH - (row + 1) * CARD_H_MM - row * GAP_MM) * PT,
            width: CARD_W_MM * PT,
            height: CARD_H_MM * PT,
          });
        });
      }

      const bytes = await pdf.save();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="deck-${code}.pdf"`);
      res.end(Buffer.from(bytes));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Could not build the PDF." });
    }
  };

  app.get("/api/pdf", pdfHandler);
  app.post("/api/pdf", express.json({ limit: "64kb" }), pdfHandler);

  return app;
}
