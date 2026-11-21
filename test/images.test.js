import test from "node:test";
import assert from "node:assert/strict";

import { Jimp } from "jimp";
import jpeg from "jpeg-js";

import { isValidImagePath, customCardJpeg } from "../images.js";

test("isValidImagePath accepts DB art paths and rejects unsafe ones", () => {
  assert.equal(isValidImagePath("pr/bcs/bcs2019_vgp01.png"), true);
  assert.equal(isValidImagePath("bt01/bt01_012en.png"), true);
  assert.equal(isValidImagePath("../etc/passwd.png"), false);
  assert.equal(isValidImagePath("a.png"), false);
});

test("customCardJpeg contains a square image into a white 59x86 canvas", async () => {
  const source = new Jimp({ width: 100, height: 100, color: 0xff0000ff });
  const png = await source.getBuffer("image/png");

  const out = await customCardJpeg(png);
  const { width, height, data } = jpeg.decode(out);

  assert.ok(Math.abs(width / height - 59 / 86) < 0.01);
  assert.equal(data[0], 255);
  assert.equal(data[1], 255);
  assert.equal(data[2], 255);
});
