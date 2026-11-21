import { PDFDocument } from "pdf-lib";

import {
  PT,
  CARD_W_MM,
  CARD_H_MM,
  COLS,
  ROWS,
  GAP_MM,
  PAGE_W_MM,
  PAGE_H_MM,
  IMAGE_CONCURRENCY,
} from "./constants.js";
import { HttpError } from "./errors.js";
import { fetchImage, cardJpeg, customCardJpeg, mapLimit } from "./images.js";
import { readCustomImage } from "./library.js";

function cardKey(card) {
  return card.source === "custom" ? `custom:${card.image}` : `db:${card.picture}`;
}

export async function defaultResolveImage(card, { fetchFn = fetch } = {}) {
  if (card.source === "custom") {
    const buffer = await readCustomImage(card.image);
    return customCardJpeg(buffer);
  }

  // Prime the image pipeline's raw cache with the injected fetch so cardJpeg
  // reuses those bytes instead of re-fetching with the default fetch.
  await fetchImage(card.picture, { fetchFn });
  return cardJpeg(card.picture);
}

export async function buildPdf({
  title,
  cards,
  resolveImage = null,
  fetchFn = fetch,
}) {
  if (!cards.some((card) => card.count > 0)) {
    throw new HttpError(400, "No cards are selected to print.");
  }

  const printable = cards.filter((card) => card.count > 0);
  const resolve = resolveImage ?? ((card) => defaultResolveImage(card, { fetchFn }));

  const unique = new Map();
  for (const card of printable) {
    const key = cardKey(card);
    if (!unique.has(key)) unique.set(key, card);
  }

  const resolved = new Map();
  await mapLimit([...unique.values()], IMAGE_CONCURRENCY, async (card) => {
    resolved.set(cardKey(card), await resolve(card));
  });

  const pdf = await PDFDocument.create();
  pdf.setTitle(title || "");
  pdf.setProducer("decklist-printer");

  const embedded = new Map();
  for (const [key, jpeg] of resolved) {
    // pdf-lib reads `imageData.buffer` without honoring byteOffset, so pooled
    // Buffers (from jpeg-js/Jimp) must be copied into a zero-offset view.
    embedded.set(key, await pdf.embedJpg(new Uint8Array(jpeg)));
  }

  const copies = printable.flatMap((card) =>
    Array.from({ length: card.count }, () => card)
  );
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
      page.drawImage(embedded.get(cardKey(card)), {
        x: (originX + col * (CARD_W_MM + GAP_MM)) * PT,
        y: (originY + gridH - (row + 1) * CARD_H_MM - row * GAP_MM) * PT,
        width: CARD_W_MM * PT,
        height: CARD_H_MM * PT,
      });
    });
  }

  return pdf.save();
}
