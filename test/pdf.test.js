import test from "node:test";
import assert from "node:assert/strict";

import { PDFDocument } from "pdf-lib";
import { Jimp } from "jimp";

import { buildPdf } from "../pdf.js";

const tinyJpeg = async () => {
  const image = new Jimp({ width: 20, height: 30, color: 0x336699ff });
  return image.getBuffer("image/jpeg");
};

test("buildPdf rejects with status 400 when no cards are selected", async () => {
  await assert.rejects(
    () =>
      buildPdf({
        title: "t",
        cards: [{ count: 0, source: "db", picture: "x.png" }],
        resolveImage: async () => tinyJpeg(),
      }),
    (error) => error.status === 400
  );
});

test("buildPdf returns a one-page PDF for nine copies", async () => {
  const bytes = await buildPdf({
    title: "t",
    cards: [{ count: 9, source: "db", picture: "x.png" }],
    resolveImage: async () => tinyJpeg(),
  });

  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
});

test("buildPdf returns a two-page PDF for ten copies", async () => {
  const bytes = await buildPdf({
    title: "t",
    cards: [{ count: 10, source: "db", picture: "x.png" }],
    resolveImage: async () => tinyJpeg(),
  });

  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
});
