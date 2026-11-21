import test from "node:test";
import assert from "node:assert/strict";

import {
  DECKLOG_VIEW,
  IMAGE_BASE,
  CARD_CATALOG,
  USER_AGENT,
  PT,
  CARD_W_MM,
  CARD_H_MM,
  COLS,
  ROWS,
  GAP_MM,
  PAGE_W_MM,
  PAGE_H_MM,
  UPSCALE,
  JPEG_QUALITY,
  IMAGE_CONCURRENCY,
} from "../constants.js";
import { HttpError } from "../errors.js";

test("card grid and image constants have the expected values", () => {
  assert.equal(CARD_W_MM, 59);
  assert.equal(CARD_H_MM, 86);
  assert.equal(COLS, 3);
  assert.equal(ROWS, 3);
  assert.equal(GAP_MM, 5);
  assert.equal(PAGE_W_MM, 210);
  assert.equal(PAGE_H_MM, 297);
  assert.equal(UPSCALE, 3);
  assert.equal(JPEG_QUALITY, 92);
  assert.equal(IMAGE_CONCURRENCY, 6);
});

test("URL and unit constants are exported", () => {
  assert.equal(DECKLOG_VIEW, "https://decklog-en.bushiroad.com/system/app/api/view/");
  assert.equal(IMAGE_BASE, "https://en.cf-vanguard.com/wordpress/wp-content/images/cardlist/");
  assert.equal(CARD_CATALOG, "https://en.cf-vanguard.com/manage/en-api/cards");
  assert.equal(typeof USER_AGENT, "string");
  assert.ok(USER_AGENT.length > 0);
  assert.equal(PT, 72 / 25.4);
});

test("HttpError records the status code", () => {
  const error = new HttpError(409, "boom");
  assert.equal(error.status, 409);
  assert.equal(error.message, "boom");
  assert.ok(error instanceof Error);
});
