import { DECKLOG_VIEW, USER_AGENT } from "./constants.js";
import { HttpError } from "./errors.js";

export function parseDeckCode(input) {
  const raw = String(input ?? "").trim();
  const fromUrl = raw.match(/\/view\/([A-Za-z0-9_-]{1,10})/i);
  const code = (fromUrl ? fromUrl[1] : raw).toUpperCase();
  if (!/^[A-Z0-9_-]{1,10}$/.test(code)) {
    throw new HttpError(400, "Enter a DeckLog deck code or deck URL.");
  }
  return code;
}

export async function fetchDeck(code, { fetchFn = fetch } = {}) {
  let res;
  try {
    res = await fetchFn(DECKLOG_VIEW + encodeURIComponent(code), {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Referer: `https://decklog-en.bushiroad.com/view/${code}`,
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpError(502, "Could not reach DeckLog. Check your internet connection.");
  }
  if (!res.ok) throw new HttpError(502, `DeckLog returned ${res.status}.`);
  const body = await res.json().catch(() => null);
  if (!body || !body.id) {
    throw new HttpError(404, `Deck ${code} not found or not public.`);
  }
  return body;
}

export function deckCards(deck) {
  const cards = [];
  for (const card of [...(deck.p_list || []), ...(deck.list || [])]) {
    const num = Number(card.num) || 0;
    if (!num || !card.img) continue;
    cards.push({
      card_number: card.card_number,
      name: card.name || card.card_name || card.card_number,
      num,
      img: card.img,
      landscape: Number(card.width) > Number(card.height),
    });
  }
  return cards;
}

export function applyCounts(cards, counts) {
  if (counts === undefined) return cards;
  if (!Array.isArray(counts) || counts.length !== cards.length) {
    throw new HttpError(409, "This deck changed. Reload it and try again.");
  }
  return cards.map((card, index) => {
    const requested = Number(counts[index]);
    if (!Number.isFinite(requested)) throw new HttpError(400, "Copies must be numbers.");
    return { ...card, num: Math.max(0, Math.min(card.num, Math.trunc(requested))) };
  });
}
