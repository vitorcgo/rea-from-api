// Fills path placeholders from the page the user pointed at. A documented route
// like /pypi/{project}/json or /repos/{owner}/{repo} usually describes exactly
// the thing on that page (pypi.org/project/requests, github.com/nodejs/node).

/**
 * Two rules, in order:
 * 1. By name: a placeholder whose name matches a page path segment takes the
 *    segment after it (/project/requests → {project} = "requests").
 * 2. By position, only when no placeholder matched by name: the last N page
 *    segments fill the N placeholders in order (/nodejs/node → {owner}, {repo}).
 * A partial name match never guesses the rest. Returns undefined when unsure.
 */
export function valuesFromPage(params: string[], pageUrl: string): Record<string, string> | undefined {
  if (!params.length || params.length > 3) return undefined;
  const segs = new URL(pageUrl).pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  if (!segs.length) return undefined;
  const norm = (s: string) => s.toLowerCase().replace(/(_?id|_?name|_?slug)$/, "").replace(/s$/, "");
  const byName: Record<string, string> = {};
  for (const p of params) {
    const i = segs.findIndex((s) => norm(s) === norm(p));
    const v = i >= 0 ? segs[i + 1] : undefined;
    if (v) byName[p] = v;
  }
  const matched = Object.keys(byName).length;
  if (matched === params.length) return byName;
  if (matched > 0 || segs.length < params.length) return undefined;
  const tail = segs.slice(-params.length);
  return Object.fromEntries(params.map((p, i) => [p, tail[i]!]));
}
