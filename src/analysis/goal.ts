// Scores endpoints against the user's goal with transparent token overlap
// (URL segments, query names, schema fields). No model calls, no magic.

import type { EndpointRecord } from "../core/types.ts";
import { fieldNames } from "./schema.ts";

const STOP = new Set(
  "publicos publico the a an of to for and or in on with from data dados de da do das dos e o os as um uma para com em no na public publicos públicos site page pagina página create crie integration integração integracao typescript project projeto my meu minha descubra discover investigate investigue como how disponibiliza exposes its seus suas by".split(
    " ",
  ),
);

/**
 * Small PT/EN vocabulary so a goal in either language matches routes in either
 * language ("câmbio" ↔ /exchange, "exchange rate" ↔ /indicadorCambio). Each
 * group is a set of accent-free singular equivalents; matching is symmetric.
 */
const GROUPS: string[][] = [
  ["produto", "product", "item", "sku", "offer"],
  ["preco", "price", "pricing", "cost"],
  ["categoria", "category"],
  ["usuario", "user"],
  ["pacote", "package", "project", "release", "crate", "module"],
  ["noticia", "news", "article", "post", "story"],
  ["artigo", "article", "post"],
  ["busca", "search", "query"],
  ["versao", "version", "release"],
  ["loja", "store", "shop"],
  ["pedido", "order"],
  ["cliente", "customer", "client"],
  ["avaliacao", "review", "rating"],
  ["estoque", "stock", "inventory"],
  ["cambio", "exchange", "forex", "cotacao", "quote"],
  ["moeda", "currency", "coin"],
  ["taxa", "rate", "fee"],
  ["juro", "interest"],
  ["clima", "weather", "climate"],
  ["previsao", "forecast"],
  ["vaga", "job", "emprego"],
  ["filme", "movie", "film"],
  ["pergunta", "question"],
  ["resposta", "answer"],
  ["repositorio", "repository", "repo"],
  ["cidade", "city", "municipio"],
  ["estado", "state"],
  ["populacao", "population"],
  ["comentario", "comment"],
  ["conjunto", "dataset"],
  ["organizacao", "organization", "org"],
  ["mercado", "market"],
  ["pontuacao", "score", "point"],
];
const RELATED = new Map<string, Set<string>>();
for (const g of GROUPS) for (const w of g) RELATED.set(w, new Set([...(RELATED.get(w) ?? []), ...g]));

const fold = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "");
const singular = (t: string) => t.replace(/(oes|aes)$/, "ao").replace(/ies$/, "y").replace(/s$/, "");

export function goalTokens(goal: string): string[] {
  const base = fold(goal.toLowerCase())
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^https?$/.test(t));
  const expanded = new Set<string>();
  for (const t of base) {
    const one = singular(t);
    for (const w of [t, one, ...(RELATED.get(one) ?? RELATED.get(t) ?? [])]) {
      expanded.add(w);
      expanded.add(w.endsWith("y") ? `${w.slice(0, -1)}ies` : `${w}s`);
    }
  }
  return [...expanded];
}

/** Splits camelCase and separators: "indicadorCambio/taxa_selic" → indicador, cambio, taxa, selic. */
const words = (s: string) =>
  fold(s)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

export function scoreEndpoint(ep: EndpointRecord, tokens: string[]): number {
  if (!tokens.length) return 0;
  const hay = [...words(ep.urlTemplate), ...ep.queryParams.flatMap((p) => words(p.name)), ...fieldNames(ep.schema).flatMap(words)];
  const set = new Set(hay);
  // Glued words ("taxaselic", "exchangerates") still match a goal word of 5+ letters inside them.
  const hit = (t: string) => set.has(t) || (t.length >= 5 && hay.some((h) => h.length > t.length && h.includes(t)));
  const hits = tokens.filter(hit).length;
  let score = Math.min(1, hits / Math.max(2, Math.ceil(tokens.length / 3)));
  if (ep.responseFormat === "json") score += 0.15;
  if (ep.status === "confirmed") score += 0.1;
  return Math.round(Math.min(1, score) * 100) / 100;
}
