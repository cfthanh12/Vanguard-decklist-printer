import { CARD_CATALOG, USER_AGENT } from "./constants.js";
import { HttpError } from "./errors.js";

export const CATALOG_KEYS = [
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
];

export function sanitizeQuery(raw = {}) {
  const query = {};
  for (const key of CATALOG_KEYS) {
    if (raw[key] !== undefined) query[key] = raw[key];
  }

  const page = Number.parseInt(query.page, 10);
  query.page = Number.isFinite(page) ? page : 1;

  const perPage = Number.parseInt(query.per_page, 10);
  query.per_page = Number.isFinite(perPage) ? perPage : 24;

  return query;
}

export function mapCard(item) {
  return {
    card_number: item.card_number,
    name: item.card_name,
    picture: item.picture,
    image: "/api/image?src=" + encodeURIComponent(item.picture),
    country: item.country,
    clan: item.clan,
    grade: item.grade,
    regulation: item.regulation,
    trigger: item.card_trigger,
    rare: item.rare,
    power: item.power,
    shield: item.shield,
    critical: item.critical,
  };
}

export async function searchCards(query, { fetchFn = fetch } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sanitizeQuery(query))) {
    params.set(key, value);
  }

  let res;
  try {
    res = await fetchFn(CARD_CATALOG + "?" + params.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: "https://en.cf-vanguard.com/cardlist/",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpError(502, "Could not reach the card catalog. Check your internet connection.");
  }
  if (!res.ok) throw new HttpError(502, `Card catalog returned ${res.status}.`);

  const body = await res.json();
  return {
    total: body.total,
    page: body.page,
    per_page: body.per_page,
    nations: body.nations,
    clans: body.clans,
    items: (body.items || []).map(mapCard),
  };
}
