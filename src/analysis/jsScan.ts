// Lightweight static scan of JavaScript text for URL-like string literals.
// Complements REA's analyze-web-bundle (which only reports literal arguments
// of recognised HTTP calls) by also catching concatenated/template prefixes
// such as fetch("/api/v2/products?page=" + p). Results are *inferred* only.

export interface JsUrlCandidate {
  value: string;
  /** Absolute URL resolved against the script URL (path-only values). */
  absolute?: string;
  context: string;
  method?: string;
  offset: number;
}

const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\\n]){2,300})\1/g;
const API_HINT = /^(\/|https?:\/\/)[^\s"'`<>]*?(\/api\/|\/v\d+\/|\/graphql|\/rest\/|\/wp-json\/|\.json(\?|$)|\/ajax\/|\/_next\/data\/|\/services?\/|\/search\b)/i;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|ico|css|woff2?|ttf|eot|mp4|webm|mp3|map|js|mjs)(\?|$)/i;

export function scanJsForUrls(source: string, scriptUrl: string, max = 200): JsUrlCandidate[] {
  const out = new Map<string, JsUrlCandidate>();
  for (const m of source.matchAll(STRING_LITERAL)) {
    if (out.size >= max) break;
    let value = m[2] ?? "";
    if (m[1] === "`") value = value.replace(/\$\{[^}]*\}/g, "{param}");
    if (!API_HINT.test(value) || ASSET_EXT.test(value)) continue;
    if (/\s/.test(value) || value.includes("\\")) continue;
    const offset = m.index ?? 0;
    const context = source.slice(Math.max(0, offset - 60), Math.min(source.length, offset + value.length + 40)).replace(/\s+/g, " ");
    // Only look inside the same call's options: stop at "})", the next request call or function.
    const after = source.slice(offset + m[0].length, offset + m[0].length + 200).split(/\}\s*\)|\bfetch\s*\(|\.(?:get|post|put|patch|delete|request)\s*\(|\bfunction\b|=>/)[0] ?? "";
    const method = /\.(get|post|put|patch|delete)\s*\(\s*$/i.exec(source.slice(Math.max(0, offset - 20), offset))?.[1]?.toUpperCase()
      ?? (/method\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/i.exec(after)?.[1]?.toUpperCase());
    let absolute: string | undefined;
    try {
      absolute = new URL(value.replace(/[?&]$/, ""), scriptUrl).toString();
    } catch {
      absolute = undefined;
    }
    if (!out.has(value)) out.set(value, { value, absolute, context, method, offset });
  }
  return [...out.values()];
}
