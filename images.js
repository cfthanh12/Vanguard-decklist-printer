import { Jimp, ResizeStrategy } from "jimp";
import jpeg from "jpeg-js";

import { IMAGE_BASE, USER_AGENT, UPSCALE, JPEG_QUALITY, CARD_W_MM, CARD_H_MM } from "./constants.js";
import { HttpError } from "./errors.js";

export const IMAGE_PATH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.(png|jpe?g)$/;

const imageCache = new Map();
const rawCache = new Map();

export function isValidImagePath(src) {
  return typeof src === "string" && !src.includes("..") && IMAGE_PATH.test(src);
}

export async function fetchImage(src, { fetchFn = fetch } = {}) {
  const cached = rawCache.get(src);
  if (cached) return cached;

  if (!isValidImagePath(src)) throw new HttpError(400, "Invalid card image path.");

  const url = IMAGE_BASE + src.split("/").map(encodeURIComponent).join("/");
  let res;
  try {
    res = await fetchFn(url, {
      headers: { "User-Agent": USER_AGENT, Referer: "https://en.cf-vanguard.com/cardlist/" },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpError(502, "Could not reach the card database. Check your internet connection.");
  }
  if (!res.ok) throw new HttpError(502, `Card image failed: ${src} (${res.status}).`);

  const entry = {
    buffer: Buffer.from(await res.arrayBuffer()),
    type: res.headers.get("content-type") || "image/png",
  };
  rawCache.set(src, entry);
  return entry;
}

export async function cardJpeg(img) {
  const cached = imageCache.get(img);
  if (cached) return cached;

  const { buffer: source } = await fetchImage(img);
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
  imageCache.set(img, encoded);
  return encoded;
}

export async function customCardJpeg(buffer) {
  const art = await Jimp.read(buffer);
  if (art.bitmap.width > art.bitmap.height) art.rotate(90);

  const scale = Math.min(CARD_W_MM / art.bitmap.width, CARD_H_MM / art.bitmap.height);
  const w = Math.round(art.bitmap.width * scale);
  const h = Math.round(art.bitmap.height * scale);

  art.resize({ w, h, mode: ResizeStrategy.BICUBIC });

  const flat = new Jimp({
    width: CARD_W_MM,
    height: CARD_H_MM,
    color: 0xffffffff,
  }).composite(art, Math.round((CARD_W_MM - w) / 2), Math.round((CARD_H_MM - h) / 2));

  flat.resize({
    w: Math.round(CARD_W_MM * UPSCALE),
    h: Math.round(CARD_H_MM * UPSCALE),
    mode: ResizeStrategy.BICUBIC,
  });

  const { data, width, height } = flat.bitmap;
  return jpeg.encode({ data, width, height }, JPEG_QUALITY).data;
}

export async function mapLimit(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}
