import type { Strategy } from "./types.ts";
import { htmlStatic } from "./htmlStatic.ts";
import { officialDocs } from "./officialDocs.ts";
import { seeds } from "./seeds.ts";
import { har } from "./har.ts";
import { reaBrowser } from "./reaBrowser.ts";
import { reaBundle } from "./reaBundle.ts";
import { jsStatic } from "./jsStatic.ts";
import { verify } from "./verify.ts";
import { wellKnown } from "./wellKnown.ts";
import { frameworkData } from "./frameworkData.ts";
import { passiveSources } from "./passiveSources.ts";
import { graphql } from "./graphql.ts";
import { apiHosts } from "./apiHosts.ts";

/**
 * Execution order matters: the page is analysed first, documented sources
 * come before reverse-engineered ones, and verification always runs last.
 */
export const STRATEGIES: Strategy[] = [
  htmlStatic,
  wellKnown,
  officialDocs,
  frameworkData,
  passiveSources,
  apiHosts,
  seeds,
  har,
  reaBrowser,
  reaBundle,
  jsStatic,
  graphql,
  verify,
];

export function selectStrategies(only?: string[], skip?: string[]): Strategy[] {
  return STRATEGIES.filter((s) => (!only?.length || only.includes(s.id) || s.id === "verify") && !skip?.includes(s.id));
}
