// Detects pagination from what was observed: query params, Link headers and
// response fields. Returns the *basis* so reports can show why.

import type { EndpointRecord, PaginationInfo } from "../core/types.ts";
import { findItemsPath, getPath } from "./schema.ts";

const NEXT_FIELDS = ["next", "next_page", "nextPage", "next_url", "nextUrl", "links.next", "_links.next.href", "paging.next", "pagination.next", "meta.next"];
const CURSOR_FIELDS = ["next_cursor", "nextCursor", "cursor", "after", "endCursor", "pageInfo.endCursor", "meta.next_cursor", "next_page_token", "nextPageToken"];
const TOTAL_FIELDS = ["total", "total_count", "totalCount", "count", "total_pages", "totalPages", "meta.total", "pagination.total", "info.count", "info.pages"];

export function detectPagination(
  ep: Pick<EndpointRecord, "queryParams">,
  sample: unknown,
  linkHeader?: string | null,
): PaginationInfo | undefined {
  const itemsField = findItemsPath(sample)?.path;
  const totalField = TOTAL_FIELDS.find((f) => typeof getPath(sample, f) === "number");
  if (linkHeader && /rel="?next"?/.test(linkHeader))
    return { style: "link-header", itemsField, totalField, basis: "Link header with rel=next" };

  const names = ep.queryParams.map((p) => p.name);
  const has = (re: RegExp) => names.find((n) => re.test(n));
  const sizeParam = has(/^(limit|per_?page|page_?size|size|count|take|max_?results|rows)$/i);
  const cursorParam = has(/^(cursor|after|page_?token|next_?token|starting_?after)$/i);
  const cursorField = CURSOR_FIELDS.find((f) => {
    const v = getPath(sample, f);
    return typeof v === "string" || v === null;
  });
  if (cursorParam || cursorField)
    return {
      style: "cursor",
      param: cursorParam ?? "cursor",
      sizeParam,
      nextField: cursorField,
      itemsField,
      totalField,
      basis: [cursorParam && `query param "${cursorParam}"`, cursorField && `response field "${cursorField}"`].filter(Boolean).join(" + "),
    };

  const nextField = NEXT_FIELDS.find((f) => {
    const v = getPath(sample, f);
    return (typeof v === "string" && /^(https?:\/\/|\/|\?)/.test(v)) || (v === null && f !== "next");
  });
  const pageParam = has(/^(page|p|pg|page_?number|pageNumber)$/i);
  const offsetParam = has(/^(offset|start|skip|from)$/i);
  if (nextField && !pageParam && !offsetParam)
    return { style: "next-url", nextField, itemsField, totalField, sizeParam, basis: `response field "${nextField}" holds next URL` };
  if (pageParam)
    return {
      style: "page",
      param: pageParam,
      sizeParam,
      nextField,
      itemsField,
      totalField,
      basis: `query param "${pageParam}"${nextField ? ` + response field "${nextField}"` : ""}`,
    };
  if (offsetParam)
    return { style: "offset", param: offsetParam, sizeParam, itemsField, totalField, basis: `query param "${offsetParam}"` };
  if (nextField) return { style: "next-url", nextField, itemsField, totalField, basis: `response field "${nextField}"` };
  return undefined;
}
