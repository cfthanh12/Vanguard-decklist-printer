import test from "node:test";
import assert from "node:assert/strict";

import { parseDeckCode, fetchDeck, deckCards, applyCounts } from "../decklog.js";

test("parseDeckCode uppercases a bare code", () => {
  assert.equal(parseDeckCode("6ZGG1"), "6ZGG1");
});

test("parseDeckCode extracts and uppercases the code from a view URL", () => {
  assert.equal(
    parseDeckCode("https://decklog-en.bushiroad.com/view/6zgg1"),
    "6ZGG1"
  );
});

test("parseDeckCode rejects invalid input with status 400", () => {
  assert.throws(() => parseDeckCode("!!"), (error) => error.status === 400);
});

test("fetchDeck POSTs to the DeckLog view URL and returns the body", async () => {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ id: "6ZGG1", title: "Test Deck" }),
    };
  };

  const deck = await fetchDeck("6ZGG1", { fetchFn });

  assert.equal(deck.id, "6ZGG1");
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://decklog-en.bushiroad.com/system/app/api/view/6ZGG1"
  );
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["X-Requested-With"], "XMLHttpRequest");
});

test("deckCards merges p_list and list, drops num:0 and missing images", () => {
  const cards = deckCards({
    p_list: [
      {
        num: 4,
        img: "a.png",
        card_number: "X",
        name: "N",
        width: 100,
        height: 140,
      },
      { num: 0, img: "b.png" },
    ],
    list: [{ num: 1, img: "c.png", card_number: "Y", width: 140, height: 100 }],
  });

  assert.equal(cards.length, 2);
  assert.equal(cards[1].landscape, true);
  assert.ok(!cards.some((card) => card.num === 0));
});

test("applyCounts clamps each count into the card's num range", () => {
  assert.deepEqual(applyCounts([{ num: 2 }, { num: 3 }], [0, 99]), [
    { num: 0 },
    { num: 3 },
  ]);
});

test("applyCounts throws 409 when counts length mismatches cards", () => {
  assert.throws(
    () => applyCounts([{ num: 2 }], [1, 2]),
    (error) => error.status === 409
  );
});

test("applyCounts throws 400 on non-numeric counts", () => {
  assert.throws(
    () => applyCounts([{ num: 2 }], ["x"]),
    (error) => error.status === 400
  );
});
