// Scores endpoints against the user's goal with transparent token overlap
// (URL segments, query names, schema fields). No model calls, no magic.

import type { EndpointRecord } from "../core/types.ts";
import { fieldNames } from "./schema.ts";

const STOP = new Set(
  "publicos publico the a an of to for and or in on with from data dados de da do das dos e o os as um uma para com em no na public publicos públicos site page pagina página create crie integration integração integracao typescript project projeto my meu minha descubra discover investigate investigue como how disponibiliza exposes its seus suas".split(
    " ",
  ),
);

/** Very small PT/EN normalisation so "produtos" matches "products". Keys are accent-free singulars. */
const SYNONYMS: Record<string, string[]> = {
  produto: ["product", "item", "sku", "offer"],
  preco: ["price", "pricing"],
  categoria: ["category"],
  usuario: ["user"],
  pacote: ["package", "project", "release"],
  noticia: ["news", "article", "post"],
  busca: ["search", "query"],
  versao: ["version", "release"],
  loja: ["store", "shop"],
  pedido: ["order"],
  cliente: ["customer", "client"],
  avaliacao: ["review", "rating"],
  estoque: ["stock", "inventory"],
};

const fold = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "");

export function goalTokens(goal: string): string[] {
  const base = fold(goal.toLowerCase())
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^https?$/.test(t));
  const expanded = new Set<string>();
  for (const t of base) {
    const singular = t.replace(/(oes|aes)$/, "ao").replace(/s$/, "");
    for (const w of [t, singular, ...(SYNONYMS[singular] ?? SYNONYMS[t] ?? [])]) {
      expanded.add(w);
      expanded.add(w.endsWith("y") ? `${w.slice(0, -1)}ies` : `${w}s`);
    }
  }
  return [...expanded];
}

export function scoreEndpoint(ep: EndpointRecord, tokens: string[]): number {
  if (!tokens.length) return 0;
  const hay = [
    ...ep.urlTemplate.toLowerCase().split(/[^a-z0-9]+/),
    ...ep.queryParams.map((p) => p.name.toLowerCase()),
    ...fieldNames(ep.schema).flatMap((f) => f.toLowerCase().split(/[^a-z0-9]+/)),
  ];
  const set = new Set(hay);
  const hits = tokens.filter((t) => set.has(t)).length;
  let score = Math.min(1, hits / Math.max(2, Math.ceil(tokens.length / 3)));
  if (ep.responseFormat === "json") score += 0.15;
  if (ep.status === "confirmed") score += 0.1;
  return Math.round(Math.min(1, score) * 100) / 100;
}
