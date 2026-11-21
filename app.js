import express from "express";

import { COLS, ROWS } from "./constants.js";
import { HttpError } from "./errors.js";
import { parseDeckCode, fetchDeck, deckCards, applyCounts } from "./decklog.js";
import { fetchImage } from "./images.js";
import {
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
} from "./library.js";
import { searchCards } from "./catalog.js";
import { buildPdf } from "./pdf.js";

const CUSTOM_IMAGE_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const CUSTOM_IMAGE_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function guard(handler, fallback = "Something went wrong.") {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      res
        .status(error?.status || 500)
        .json({ error: error?.message || fallback });
    }
  };
}

export function createApp({ html, fetchFn = fetch }) {
  const app = express();

  app.get("/", (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  });

  app.get(
    "/api/deck",
    guard(async (req, res) => {
      const code = parseDeckCode(req.query.code);
      const deck = await fetchDeck(code, { fetchFn });
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
    })
  );

  app.get(
    "/api/image",
    guard(async (req, res) => {
      const { buffer, type } = await fetchImage(String(req.query.src || ""), {
        fetchFn,
      });
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(buffer);
    }, "Image could not be loaded.")
  );

  app.get(
    "/api/cards",
    guard(async (req, res) => {
      res.json(await searchCards(req.query, { fetchFn }));
    })
  );

  app.get(
    "/api/decks",
    guard(async (req, res) => {
      res.json({ decks: await listDecks() });
    })
  );

  app.post(
    "/api/decks",
    express.json(),
    guard(async (req, res) => {
      res.json(await createDeck((req.body || {}).name));
    })
  );

  app.post(
    "/api/decks/import",
    express.json({ limit: "100mb" }),
    guard(async (req, res) => {
      res.json(await importDeck(req.body || {}));
    })
  );

  app.get(
    "/api/decks/:id",
    guard(async (req, res) => {
      res.json(await getDeck(req.params.id));
    })
  );

  app.put(
    "/api/decks/:id",
    express.json({ limit: "10mb" }),
    guard(async (req, res) => {
      res.json(await saveDeck({ ...(req.body || {}), id: req.params.id }));
    })
  );

  app.delete(
    "/api/decks/:id",
    guard(async (req, res) => {
      await deleteDeck(req.params.id);
      res.json({ ok: true });
    })
  );

  app.get(
    "/api/decks/:id/export",
    guard(async (req, res) => {
      const deck = await getDeck(req.params.id);
      const payload = await exportDeck(deck);
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="deck-${deck.id}.json"`
      );
      res.json(payload);
    })
  );

  app.post(
    "/api/decks/:id/cards",
    express.raw({
      type: ["image/png", "image/jpeg", "image/webp"],
      limit: "25mb",
    }),
    guard(async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new HttpError(400, "Expected a raw image body.");
      }
      const contentType = String(req.headers["content-type"] || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const ext = CUSTOM_IMAGE_EXT[contentType];
      if (!ext) throw new HttpError(400, "Unsupported image type.");

      const deck = await getDeck(req.params.id);
      const cardId = newId();
      const image = await storeCustomImage(deck.id, cardId, req.body, ext);
      const card = {
        id: cardId,
        source: "custom",
        name: String(req.query.name || ""),
        image,
        count: 1,
      };
      deck.cards.push(card);
      await saveDeck(deck);
      res.json(deck);
    })
  );

  app.get(
    "/api/deck-image/:deckId/:file",
    guard(async (req, res) => {
      const buffer = await readCustomImage(
        `images/${req.params.deckId}/${req.params.file}`
      );
      const ext = String(req.params.file).split(".").pop().toLowerCase();
      res.setHeader(
        "Content-Type",
        CUSTOM_IMAGE_MIME[ext] || "application/octet-stream"
      );
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(buffer);
    }, "Image could not be loaded.")
  );

  const pdfHandler = guard(async (req, res) => {
    const body = req.body || {};
    let bytes;
    let filename = "deck.pdf";

    if (body.code !== undefined || req.query.code !== undefined) {
      const code = parseDeckCode(body.code ?? req.query.code);
      const deck = await fetchDeck(code, { fetchFn });
      const title = deck.title ? `${deck.title} (${code})` : code;
      const cards = applyCounts(deckCards(deck), body.counts).map((card) => ({
        count: card.num,
        source: "db",
        picture: card.img,
      }));
      bytes = await buildPdf({ title, cards, fetchFn });
      filename = `deck-${code}.pdf`;
    } else if (body.cards !== undefined) {
      bytes = await buildPdf({ title: body.title, cards: body.cards, fetchFn });
    } else {
      throw new HttpError(400, "Enter a DeckLog deck code or deck URL.");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.end(Buffer.from(bytes));
  }, "Could not build the PDF.");

  app.get("/api/pdf", pdfHandler);
  app.post("/api/pdf", express.json({ limit: "64kb" }), pdfHandler);

  return app;
}
