import test from "node:test";
import assert from "node:assert/strict";

import { CATALOG_KEYS, sanitizeQuery, mapCard, searchCards } from "../catalog.js";
import { CARD_CATALOG, USER_AGENT } from "../constants.js";

const sampleItem = {
  card_number: "X",
  card_name: "Blaster Blade",
  picture: "pr/bcs/a.png",
  country: "United Sanctuary",
  clan: "Royal Paladin",
  grade: "1",
  regulation: "V",
  card_trigger: "-",
  rare: "R",
  power: "10000",
  shield: "10000",
  critical: "1",
};

test("CATALOG_KEYS lists the supported query parameters", () => {
  assert.deepEqual(CATALOG_KEYS, [
    "keyword",
    "nation",
    "clan",
    "grade",
    "regulation",
    "trigger",
    "kind",
    "rare",
    "power_from",
    "power_to",
    "sort",
    "page",
    "per_page",
  ]);
});

test("sanitizeQuery keeps only CATALOG_KEYS and coerces page/per_page", () => {
  assert.deepEqual(
    sanitizeQuery({ keyword: "Blaster", evil: "x", page: "3", per_page: "10" }),
    { keyword: "Blaster", page: 3, per_page: 10 }
  );
});

test("sanitizeQuery defaults page and per_page", () => {
  assert.deepEqual(sanitizeQuery({}), { page: 1, per_page: 24 });
});

test("mapCard maps the catalog item to a CardResult", () => {
  assert.deepEqual(mapCard(sampleItem), {
    card_number: "X",
    name: "Blaster Blade",
    picture: "pr/bcs/a.png",
    image: "/api/image?src=pr%2Fbcs%2Fa.png",
    country: "United Sanctuary",
    clan: "Royal Paladin",
    grade: "1",
    regulation: "V",
    trigger: "-",
    rare: "R",
    power: "10000",
    shield: "10000",
    critical: "1",
  });
});

test("searchCards GETs CARD_CATALOG and maps items", async () => {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      total: 1,
      page: 1,
      per_page: 24,
      nations: [],
      clans: [],
      items: [sampleItem],
    });
  };

  const result = await searchCards({ keyword: "Blaster" }, { fetchFn });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].name, "Blaster Blade");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, CARD_CATALOG + "?keyword=Blaster&page=1&per_page=24");
  assert.equal(calls[0].options.headers["User-Agent"], USER_AGENT);
  assert.equal(calls[0].options.headers.Referer, "https://en.cf-vanguard.com/cardlist/");
});

test("searchCards throws 502 on a non-2xx response", async () => {
  const fetchFn = async () => ({ ok: false, status: 500 });

  await assert.rejects(
    searchCards({ keyword: "Blaster" }, { fetchFn }),
    (error) => error.status === 502
  );
});

test("searchCards throws 502 on network failure", async () => {
  const fetchFn = async () => {
    throw new TypeError("fetch failed");
  };

  await assert.rejects(
    searchCards({ keyword: "Blaster" }, { fetchFn }),
    (error) => error.status === 502
  );
});
