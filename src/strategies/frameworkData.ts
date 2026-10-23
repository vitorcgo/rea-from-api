import type { Strategy, InvestigationContext } from "./types.ts";
import { ingestSpecUrl } from "./specIngest.ts";

/**
 * Framework conventions: once the stack is fingerprinted, its public data
 * routes for *this already-public page* are predictable (Next.js pages router,
 * Gatsby, Nuxt 3, SvelteKit) and some platforms expose documented public
 * catalog APIs (WordPress REST, WooCommerce Store API, Shopify storefront JSON,
 * Drupal JSON:API). Candidates are only derived for the detected framework,
 * never brute forced, and are replayed by `verify` like any other candidate.
 */
export const frameworkData: Strategy = {
  id: "framework-data",
  description: "Derive the fingerprinted framework's data routes (Next.js _next/data, Gatsby page-data, Nuxt _payload, SvelteKit __data, WP/Woo/Shopify/Drupal public APIs)",
  skip: (ctx) => (!ctx.page ? "no HTML page" : undefined),
  async run(ctx) {
    const page = ctx.page!;
    const html = page.html;
    const u = new URL(page.url);
    const path = u.pathname.replace(/\/$/, "") || "";
    const add: { url: string; framework: string; documented?: boolean; note: string; purpose?: string }[] = [];

    const next = page.analysis.embedded.find((e) => e.kind === "next-data")?.data as { buildId?: string; page?: string; isFallback?: boolean } | undefined;
    if (next?.buildId && /^[\w-]+$/.test(next.buildId)) {
      add.push({
        url: `${u.origin}/_next/data/${next.buildId}${path || "/index"}.json${u.search}`,
        framework: "Next.js (pages router)",
        note: `Next.js data route for this page (buildId ${next.buildId} from __NEXT_DATA__; changes on every deploy)`,
        purpose: `Page props for ${path || "/"} (Next.js getServerSideProps/getStaticProps)`,
      });
    }
    if (/___gatsby|\/page-data\//.test(html)) {
      add.push({ url: `${u.origin}/page-data${path || "/index"}/page-data.json`, framework: "Gatsby", note: "Gatsby page-data for this page", purpose: `Page data for ${path || "/"} (Gatsby)` });
    }
    if (/__NUXT_DATA__|window\.__NUXT__|\/_nuxt\//.test(html)) {
      add.push({ url: `${u.origin}${path}/_payload.json`, framework: "Nuxt 3", note: "Nuxt payload for this page (devalue-encoded JSON; exists when payload extraction is enabled)", purpose: `Page payload for ${path || "/"} (Nuxt)` });
    }
    if (/__sveltekit|data-sveltekit/.test(html)) {
      add.push({ url: `${u.origin}${path}/__data.json`, framework: "SvelteKit", note: "SvelteKit server load data for this page (devalue-encoded)", purpose: `Load data for ${path || "/"} (SvelteKit)` });
    }
    if (/woocommerce/i.test(html)) {
      add.push({
        url: `${u.origin}/wp-json/wc/store/v1/products`,
        framework: "WooCommerce",
        documented: true,
        note: "WooCommerce Store API: public, unauthenticated by design (developer.woocommerce.com/docs/apis/store-api)",
        purpose: "List products (WooCommerce Store API)",
      });
    }
    if (/cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html)) {
      add.push({ url: `${u.origin}/products.json`, framework: "Shopify", note: "Shopify storefront products JSON (public storefront convention, not a versioned API)", purpose: "List products (Shopify storefront)" });
      add.push({ url: `${u.origin}/collections.json`, framework: "Shopify", note: "Shopify storefront collections JSON", purpose: "List collections (Shopify storefront)" });
    }
    if (/Drupal\.settings|drupalSettings|content="Drupal/i.test(html)) {
      add.push({ url: `${u.origin}/jsonapi`, framework: "Drupal", documented: true, note: "Drupal JSON:API entry point (enabled only if the module is on)", purpose: "JSON:API index (Drupal)" });
    }

    let wpOps = 0;
    if (/wp-content|wp-json|wp-includes/i.test(html)) wpOps = await ingestSpecUrl(ctx, `${u.origin}/wp-json/`, { strategy: this.id, label: "WordPress" });

    for (const a of add) {
      const ev = ctx.evidence.add({ strategy: this.id, kind: "note", source: page.url, summary: `${a.framework}: derived ${a.url}` });
      ctx.inventory.add({ method: "GET", url: a.url, strategy: this.id, evidenceId: ev.id, status: "inferred", documented: a.documented, purpose: a.purpose, note: a.note });
    }
    rememberFrameworks(ctx, add.map((a) => a.framework));
    return { status: "ok", detail: add.length || wpOps ? `${[...new Set(add.map((a) => a.framework))].join(", ") || "WordPress"}: ${add.length} derived routes${wpOps ? `, ${wpOps} wp-json routes` : ""}` : "no supported framework data convention detected" };
  },
};

function rememberFrameworks(ctx: InvestigationContext, names: string[]): void {
  for (const n of new Set(names)) if (!ctx.tech.some((t) => t.name === n)) ctx.tech.push({ name: n, basis: "framework data convention" });
}
