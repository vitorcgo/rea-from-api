// Types and validators inferred from responses observed on 2026-10-23.
// They describe what was seen, not a documented contract. A ValidationError signals format drift.

import { fail, isObject } from "./errors.ts";

export type PypiByProjectVersionResponse = {
  info: {
    author: string;
    author_email: string;
    bugtrack_url: null;
    classifiers: string[];
    description: string;
    description_content_type: string;
    docs_url: null;
    download_url: null;
    downloads: {
      last_day: number;
      last_month: number;
      last_week: number;
    };
    dynamic: null;
    home_page: string;
    keywords: null;
    license: string;
    license_expression: null;
    license_files: null;
    maintainer: null;
    maintainer_email: null;
    name: string;
    package_url: string;
    platform: null;
    project_url: string;
    project_urls: {
      Documentation: string;
      Homepage: string;
      Source: string;
    };
    provides_extra: string[];
    release_url: string;
    requires_dist: string[];
    requires_python: string;
    summary: string;
    version: string;
    yanked: boolean;
    yanked_reason: null;
  };
  last_serial: number;
  ownership: {
    organization: null;
    roles: {
      role: string;
      user: string;
    }[];
  };
  urls: {
    comment_text: string;
    "core-metadata": {
      sha256: string;
    } | boolean;
    digests: {
      blake2b_256: string;
      md5: string;
      sha256: string;
    };
    downloads: number;
    filename: string;
    has_sig: boolean;
    md5_digest: string;
    packagetype: string;
    python_version: string;
    requires_python: string;
    size: number;
    upload_time: string;
    upload_time_iso_8601: string;
    url: string;
    yanked: boolean;
    yanked_reason: null;
  }[];
  vulnerabilities: {
    aliases: string[];
    details: string;
    fixed_in: string[];
    id: string;
    link: string;
    source: string;
    summary: null;
    withdrawn: null;
  }[];
};

export function validatePypiByProjectVersionResponse(value: unknown): PypiByProjectVersionResponse {
  if (!isObject(value)) fail("$", "object", value);
  if (isObject(value)) {
    if (!("info" in (value as object))) fail("$.info", "present", undefined);
      if (!isObject((value as Record<string, unknown>)["info"])) fail("$.info", "object", (value as Record<string, unknown>)["info"]);
      if (isObject((value as Record<string, unknown>)["info"])) {
        if (!("author" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.author", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["author"] !== "string") fail("$.info.author", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["author"]);
        if (!("author_email" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.author_email", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["author_email"] !== "string") fail("$.info.author_email", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["author_email"]);
        if (!("bugtrack_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.bugtrack_url", "present", undefined);
        if (!("classifiers" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.classifiers", "present", undefined);
          if (!Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["classifiers"])) fail("$.info.classifiers", "array", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["classifiers"]);
          if (Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["classifiers"])) for (const item2 of ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["classifiers"] as unknown[]) {
            if (typeof item2 !== "string") fail("$.info.classifiers[]", "string", item2);
          }
        if (!("description" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.description", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["description"] !== "string") fail("$.info.description", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["description"]);
        if (!("description_content_type" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.description_content_type", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["description_content_type"] !== "string") fail("$.info.description_content_type", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["description_content_type"]);
        if (!("docs_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.docs_url", "present", undefined);
        if (!("download_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.download_url", "present", undefined);
        if (!("downloads" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.downloads", "present", undefined);
          if (!isObject(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"])) fail("$.info.downloads", "object", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"]);
          if (isObject(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"])) {
            if (!("last_day" in (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as object))) fail("$.info.downloads.last_day", "present", undefined);
              if (typeof (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_day"] !== "number") fail("$.info.downloads.last_day", "number", (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_day"]);
            if (!("last_month" in (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as object))) fail("$.info.downloads.last_month", "present", undefined);
              if (typeof (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_month"] !== "number") fail("$.info.downloads.last_month", "number", (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_month"]);
            if (!("last_week" in (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as object))) fail("$.info.downloads.last_week", "present", undefined);
              if (typeof (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_week"] !== "number") fail("$.info.downloads.last_week", "number", (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_week"]);
          }
        if (!("dynamic" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.dynamic", "present", undefined);
        if (!("home_page" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.home_page", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["home_page"] !== "string") fail("$.info.home_page", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["home_page"]);
        if (!("keywords" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.keywords", "present", undefined);
        if (!("license" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.license", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["license"] !== "string") fail("$.info.license", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["license"]);
        if (!("license_expression" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.license_expression", "present", undefined);
        if (!("license_files" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.license_files", "present", undefined);
        if (!("maintainer" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.maintainer", "present", undefined);
        if (!("maintainer_email" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.maintainer_email", "present", undefined);
        if (!("name" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.name", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["name"] !== "string") fail("$.info.name", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["name"]);
        if (!("package_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.package_url", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["package_url"] !== "string") fail("$.info.package_url", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["package_url"]);
        if (!("platform" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.platform", "present", undefined);
        if (!("project_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.project_url", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_url"] !== "string") fail("$.info.project_url", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_url"]);
        if (!("project_urls" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.project_urls", "present", undefined);
          if (!isObject(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"])) fail("$.info.project_urls", "object", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"]);
          if (isObject(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"])) {
            if (!("Documentation" in (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as object))) fail("$.info.project_urls.Documentation", "present", undefined);
              if (typeof (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as Record<string, unknown>)["Documentation"] !== "string") fail("$.info.project_urls.Documentation", "string", (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as Record<string, unknown>)["Documentation"]);
            if (!("Homepage" in (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as object))) fail("$.info.project_urls.Homepage", "present", undefined);
              if (typeof (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as Record<string, unknown>)["Homepage"] !== "string") fail("$.info.project_urls.Homepage", "string", (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as Record<string, unknown>)["Homepage"]);
            if (!("Source" in (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as object))) fail("$.info.project_urls.Source", "present", undefined);
              if (typeof (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as Record<string, unknown>)["Source"] !== "string") fail("$.info.project_urls.Source", "string", (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as Record<string, unknown>)["Source"]);
          }
        if (!("provides_extra" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.provides_extra", "present", undefined);
          if (!Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["provides_extra"])) fail("$.info.provides_extra", "array", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["provides_extra"]);
          if (Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["provides_extra"])) for (const item2 of ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["provides_extra"] as unknown[]) {
            if (typeof item2 !== "string") fail("$.info.provides_extra[]", "string", item2);
          }
        if (!("release_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.release_url", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["release_url"] !== "string") fail("$.info.release_url", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["release_url"]);
        if (!("requires_dist" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.requires_dist", "present", undefined);
          if (!Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_dist"])) fail("$.info.requires_dist", "array", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_dist"]);
          if (Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_dist"])) for (const item2 of ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_dist"] as unknown[]) {
            if (typeof item2 !== "string") fail("$.info.requires_dist[]", "string", item2);
          }
        if (!("requires_python" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.requires_python", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_python"] !== "string") fail("$.info.requires_python", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_python"]);
        if (!("summary" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.summary", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["summary"] !== "string") fail("$.info.summary", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["summary"]);
        if (!("version" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.version", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["version"] !== "string") fail("$.info.version", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["version"]);
        if (!("yanked" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.yanked", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["yanked"] !== "boolean") fail("$.info.yanked", "boolean", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["yanked"]);
        if (!("yanked_reason" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.yanked_reason", "present", undefined);
      }
    if (!("last_serial" in (value as object))) fail("$.last_serial", "present", undefined);
      if (typeof (value as Record<string, unknown>)["last_serial"] !== "number") fail("$.last_serial", "number", (value as Record<string, unknown>)["last_serial"]);
    if (!("ownership" in (value as object))) fail("$.ownership", "present", undefined);
      if (!isObject((value as Record<string, unknown>)["ownership"])) fail("$.ownership", "object", (value as Record<string, unknown>)["ownership"]);
      if (isObject((value as Record<string, unknown>)["ownership"])) {
        if (!("organization" in ((value as Record<string, unknown>)["ownership"] as object))) fail("$.ownership.organization", "present", undefined);
        if (!("roles" in ((value as Record<string, unknown>)["ownership"] as object))) fail("$.ownership.roles", "present", undefined);
          if (!Array.isArray(((value as Record<string, unknown>)["ownership"] as Record<string, unknown>)["roles"])) fail("$.ownership.roles", "array", ((value as Record<string, unknown>)["ownership"] as Record<string, unknown>)["roles"]);
          if (Array.isArray(((value as Record<string, unknown>)["ownership"] as Record<string, unknown>)["roles"])) for (const item2 of ((value as Record<string, unknown>)["ownership"] as Record<string, unknown>)["roles"] as unknown[]) {
            if (!isObject(item2)) fail("$.ownership.roles[]", "object", item2);
            if (isObject(item2)) {
              if (!("role" in (item2 as object))) fail("$.ownership.roles[].role", "present", undefined);
                if (typeof (item2 as Record<string, unknown>)["role"] !== "string") fail("$.ownership.roles[].role", "string", (item2 as Record<string, unknown>)["role"]);
              if (!("user" in (item2 as object))) fail("$.ownership.roles[].user", "present", undefined);
                if (typeof (item2 as Record<string, unknown>)["user"] !== "string") fail("$.ownership.roles[].user", "string", (item2 as Record<string, unknown>)["user"]);
            }
          }
      }
    if (!("urls" in (value as object))) fail("$.urls", "present", undefined);
      if (!Array.isArray((value as Record<string, unknown>)["urls"])) fail("$.urls", "array", (value as Record<string, unknown>)["urls"]);
      if (Array.isArray((value as Record<string, unknown>)["urls"])) for (const item1 of (value as Record<string, unknown>)["urls"] as unknown[]) {
        if (!isObject(item1)) fail("$.urls[]", "object", item1);
        if (isObject(item1)) {
          if (!("comment_text" in (item1 as object))) fail("$.urls[].comment_text", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["comment_text"] !== "string") fail("$.urls[].comment_text", "string", (item1 as Record<string, unknown>)["comment_text"]);
          if (!("core-metadata" in (item1 as object))) fail("$.urls[].core-metadata", "present", undefined);
          if (!("digests" in (item1 as object))) fail("$.urls[].digests", "present", undefined);
            if (!isObject((item1 as Record<string, unknown>)["digests"])) fail("$.urls[].digests", "object", (item1 as Record<string, unknown>)["digests"]);
            if (isObject((item1 as Record<string, unknown>)["digests"])) {
              if (!("blake2b_256" in ((item1 as Record<string, unknown>)["digests"] as object))) fail("$.urls[].digests.blake2b_256", "present", undefined);
                if (typeof ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["blake2b_256"] !== "string") fail("$.urls[].digests.blake2b_256", "string", ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["blake2b_256"]);
              if (!("md5" in ((item1 as Record<string, unknown>)["digests"] as object))) fail("$.urls[].digests.md5", "present", undefined);
                if (typeof ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["md5"] !== "string") fail("$.urls[].digests.md5", "string", ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["md5"]);
              if (!("sha256" in ((item1 as Record<string, unknown>)["digests"] as object))) fail("$.urls[].digests.sha256", "present", undefined);
                if (typeof ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["sha256"] !== "string") fail("$.urls[].digests.sha256", "string", ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["sha256"]);
            }
          if (!("downloads" in (item1 as object))) fail("$.urls[].downloads", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["downloads"] !== "number") fail("$.urls[].downloads", "number", (item1 as Record<string, unknown>)["downloads"]);
          if (!("filename" in (item1 as object))) fail("$.urls[].filename", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["filename"] !== "string") fail("$.urls[].filename", "string", (item1 as Record<string, unknown>)["filename"]);
          if (!("has_sig" in (item1 as object))) fail("$.urls[].has_sig", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["has_sig"] !== "boolean") fail("$.urls[].has_sig", "boolean", (item1 as Record<string, unknown>)["has_sig"]);
          if (!("md5_digest" in (item1 as object))) fail("$.urls[].md5_digest", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["md5_digest"] !== "string") fail("$.urls[].md5_digest", "string", (item1 as Record<string, unknown>)["md5_digest"]);
          if (!("packagetype" in (item1 as object))) fail("$.urls[].packagetype", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["packagetype"] !== "string") fail("$.urls[].packagetype", "string", (item1 as Record<string, unknown>)["packagetype"]);
          if (!("python_version" in (item1 as object))) fail("$.urls[].python_version", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["python_version"] !== "string") fail("$.urls[].python_version", "string", (item1 as Record<string, unknown>)["python_version"]);
          if (!("requires_python" in (item1 as object))) fail("$.urls[].requires_python", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["requires_python"] !== "string") fail("$.urls[].requires_python", "string", (item1 as Record<string, unknown>)["requires_python"]);
          if (!("size" in (item1 as object))) fail("$.urls[].size", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["size"] !== "number") fail("$.urls[].size", "number", (item1 as Record<string, unknown>)["size"]);
          if (!("upload_time" in (item1 as object))) fail("$.urls[].upload_time", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["upload_time"] !== "string") fail("$.urls[].upload_time", "string", (item1 as Record<string, unknown>)["upload_time"]);
          if (!("upload_time_iso_8601" in (item1 as object))) fail("$.urls[].upload_time_iso_8601", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["upload_time_iso_8601"] !== "string") fail("$.urls[].upload_time_iso_8601", "string", (item1 as Record<string, unknown>)["upload_time_iso_8601"]);
          if (!("url" in (item1 as object))) fail("$.urls[].url", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["url"] !== "string") fail("$.urls[].url", "string", (item1 as Record<string, unknown>)["url"]);
          if (!("yanked" in (item1 as object))) fail("$.urls[].yanked", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["yanked"] !== "boolean") fail("$.urls[].yanked", "boolean", (item1 as Record<string, unknown>)["yanked"]);
          if (!("yanked_reason" in (item1 as object))) fail("$.urls[].yanked_reason", "present", undefined);
        }
      }
    if (!("vulnerabilities" in (value as object))) fail("$.vulnerabilities", "present", undefined);
      if (!Array.isArray((value as Record<string, unknown>)["vulnerabilities"])) fail("$.vulnerabilities", "array", (value as Record<string, unknown>)["vulnerabilities"]);
      if (Array.isArray((value as Record<string, unknown>)["vulnerabilities"])) for (const item1 of (value as Record<string, unknown>)["vulnerabilities"] as unknown[]) {
        if (!isObject(item1)) fail("$.vulnerabilities[]", "object", item1);
        if (isObject(item1)) {
          if (!("aliases" in (item1 as object))) fail("$.vulnerabilities[].aliases", "present", undefined);
            if (!Array.isArray((item1 as Record<string, unknown>)["aliases"])) fail("$.vulnerabilities[].aliases", "array", (item1 as Record<string, unknown>)["aliases"]);
            if (Array.isArray((item1 as Record<string, unknown>)["aliases"])) for (const item3 of (item1 as Record<string, unknown>)["aliases"] as unknown[]) {
              if (typeof item3 !== "string") fail("$.vulnerabilities[].aliases[]", "string", item3);
            }
          if (!("details" in (item1 as object))) fail("$.vulnerabilities[].details", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["details"] !== "string") fail("$.vulnerabilities[].details", "string", (item1 as Record<string, unknown>)["details"]);
          if (!("fixed_in" in (item1 as object))) fail("$.vulnerabilities[].fixed_in", "present", undefined);
            if (!Array.isArray((item1 as Record<string, unknown>)["fixed_in"])) fail("$.vulnerabilities[].fixed_in", "array", (item1 as Record<string, unknown>)["fixed_in"]);
            if (Array.isArray((item1 as Record<string, unknown>)["fixed_in"])) for (const item3 of (item1 as Record<string, unknown>)["fixed_in"] as unknown[]) {
              if (typeof item3 !== "string") fail("$.vulnerabilities[].fixed_in[]", "string", item3);
            }
          if (!("id" in (item1 as object))) fail("$.vulnerabilities[].id", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["id"] !== "string") fail("$.vulnerabilities[].id", "string", (item1 as Record<string, unknown>)["id"]);
          if (!("link" in (item1 as object))) fail("$.vulnerabilities[].link", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["link"] !== "string") fail("$.vulnerabilities[].link", "string", (item1 as Record<string, unknown>)["link"]);
          if (!("source" in (item1 as object))) fail("$.vulnerabilities[].source", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["source"] !== "string") fail("$.vulnerabilities[].source", "string", (item1 as Record<string, unknown>)["source"]);
          if (!("summary" in (item1 as object))) fail("$.vulnerabilities[].summary", "present", undefined);
          if (!("withdrawn" in (item1 as object))) fail("$.vulnerabilities[].withdrawn", "present", undefined);
        }
      }
  }
  return value as PypiByProjectVersionResponse;
}

export type PypiResponse = {
  info: {
    author: null;
    author_email: string;
    bugtrack_url: null;
    classifiers: string[];
    description: string;
    description_content_type: string;
    docs_url: null;
    download_url: null;
    downloads: {
      last_day: number;
      last_month: number;
      last_week: number;
    };
    dynamic: string[];
    home_page: null;
    keywords: null;
    license: string;
    license_expression: null;
    license_files: string[];
    maintainer: null;
    maintainer_email: string;
    name: string;
    package_url: string;
    platform: null;
    project_url: string;
    project_urls: {
      Documentation: string;
      Source: string;
    };
    provides_extra: string[];
    release_url: string;
    requires_dist: string[];
    requires_python: string;
    summary: string;
    version: string;
    yanked: boolean;
    yanked_reason: null;
  };
  last_serial: number;
  ownership: {
    organization: null;
    roles: {
      role: string;
      user: string;
    }[];
  };
  releases: Record<string, {
    comment_text: string | null;
    "core-metadata": unknown;
    digests: {
      blake2b_256: string;
      md5: string;
      sha256: string;
    };
    downloads: number;
    filename: string;
    has_sig: boolean;
    md5_digest: string;
    packagetype: string;
    python_version: string;
    requires_python: string | null;
    size: number;
    upload_time: string;
    upload_time_iso_8601: string;
    url: string;
    yanked: boolean;
    yanked_reason: string | null;
  }[]>;
  urls: {
    comment_text: null;
    "core-metadata": {
      sha256: string;
    } | boolean;
    digests: {
      blake2b_256: string;
      md5: string;
      sha256: string;
    };
    downloads: number;
    filename: string;
    has_sig: boolean;
    md5_digest: string;
    packagetype: string;
    python_version: string;
    requires_python: string;
    size: number;
    upload_time: string;
    upload_time_iso_8601: string;
    url: string;
    yanked: boolean;
    yanked_reason: null;
  }[];
  vulnerabilities: unknown[];
};

export function validatePypiResponse(value: unknown): PypiResponse {
  if (!isObject(value)) fail("$", "object", value);
  if (isObject(value)) {
    if (!("info" in (value as object))) fail("$.info", "present", undefined);
      if (!isObject((value as Record<string, unknown>)["info"])) fail("$.info", "object", (value as Record<string, unknown>)["info"]);
      if (isObject((value as Record<string, unknown>)["info"])) {
        if (!("author" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.author", "present", undefined);
        if (!("author_email" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.author_email", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["author_email"] !== "string") fail("$.info.author_email", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["author_email"]);
        if (!("bugtrack_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.bugtrack_url", "present", undefined);
        if (!("classifiers" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.classifiers", "present", undefined);
          if (!Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["classifiers"])) fail("$.info.classifiers", "array", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["classifiers"]);
          if (Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["classifiers"])) for (const item2 of ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["classifiers"] as unknown[]) {
            if (typeof item2 !== "string") fail("$.info.classifiers[]", "string", item2);
          }
        if (!("description" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.description", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["description"] !== "string") fail("$.info.description", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["description"]);
        if (!("description_content_type" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.description_content_type", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["description_content_type"] !== "string") fail("$.info.description_content_type", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["description_content_type"]);
        if (!("docs_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.docs_url", "present", undefined);
        if (!("download_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.download_url", "present", undefined);
        if (!("downloads" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.downloads", "present", undefined);
          if (!isObject(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"])) fail("$.info.downloads", "object", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"]);
          if (isObject(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"])) {
            if (!("last_day" in (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as object))) fail("$.info.downloads.last_day", "present", undefined);
              if (typeof (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_day"] !== "number") fail("$.info.downloads.last_day", "number", (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_day"]);
            if (!("last_month" in (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as object))) fail("$.info.downloads.last_month", "present", undefined);
              if (typeof (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_month"] !== "number") fail("$.info.downloads.last_month", "number", (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_month"]);
            if (!("last_week" in (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as object))) fail("$.info.downloads.last_week", "present", undefined);
              if (typeof (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_week"] !== "number") fail("$.info.downloads.last_week", "number", (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["downloads"] as Record<string, unknown>)["last_week"]);
          }
        if (!("dynamic" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.dynamic", "present", undefined);
          if (!Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["dynamic"])) fail("$.info.dynamic", "array", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["dynamic"]);
          if (Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["dynamic"])) for (const item2 of ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["dynamic"] as unknown[]) {
            if (typeof item2 !== "string") fail("$.info.dynamic[]", "string", item2);
          }
        if (!("home_page" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.home_page", "present", undefined);
        if (!("keywords" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.keywords", "present", undefined);
        if (!("license" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.license", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["license"] !== "string") fail("$.info.license", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["license"]);
        if (!("license_expression" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.license_expression", "present", undefined);
        if (!("license_files" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.license_files", "present", undefined);
          if (!Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["license_files"])) fail("$.info.license_files", "array", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["license_files"]);
          if (Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["license_files"])) for (const item2 of ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["license_files"] as unknown[]) {
            if (typeof item2 !== "string") fail("$.info.license_files[]", "string", item2);
          }
        if (!("maintainer" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.maintainer", "present", undefined);
        if (!("maintainer_email" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.maintainer_email", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["maintainer_email"] !== "string") fail("$.info.maintainer_email", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["maintainer_email"]);
        if (!("name" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.name", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["name"] !== "string") fail("$.info.name", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["name"]);
        if (!("package_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.package_url", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["package_url"] !== "string") fail("$.info.package_url", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["package_url"]);
        if (!("platform" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.platform", "present", undefined);
        if (!("project_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.project_url", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_url"] !== "string") fail("$.info.project_url", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_url"]);
        if (!("project_urls" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.project_urls", "present", undefined);
          if (!isObject(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"])) fail("$.info.project_urls", "object", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"]);
          if (isObject(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"])) {
            if (!("Documentation" in (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as object))) fail("$.info.project_urls.Documentation", "present", undefined);
              if (typeof (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as Record<string, unknown>)["Documentation"] !== "string") fail("$.info.project_urls.Documentation", "string", (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as Record<string, unknown>)["Documentation"]);
            if (!("Source" in (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as object))) fail("$.info.project_urls.Source", "present", undefined);
              if (typeof (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as Record<string, unknown>)["Source"] !== "string") fail("$.info.project_urls.Source", "string", (((value as Record<string, unknown>)["info"] as Record<string, unknown>)["project_urls"] as Record<string, unknown>)["Source"]);
          }
        if (!("provides_extra" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.provides_extra", "present", undefined);
          if (!Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["provides_extra"])) fail("$.info.provides_extra", "array", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["provides_extra"]);
          if (Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["provides_extra"])) for (const item2 of ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["provides_extra"] as unknown[]) {
            if (typeof item2 !== "string") fail("$.info.provides_extra[]", "string", item2);
          }
        if (!("release_url" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.release_url", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["release_url"] !== "string") fail("$.info.release_url", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["release_url"]);
        if (!("requires_dist" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.requires_dist", "present", undefined);
          if (!Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_dist"])) fail("$.info.requires_dist", "array", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_dist"]);
          if (Array.isArray(((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_dist"])) for (const item2 of ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_dist"] as unknown[]) {
            if (typeof item2 !== "string") fail("$.info.requires_dist[]", "string", item2);
          }
        if (!("requires_python" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.requires_python", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_python"] !== "string") fail("$.info.requires_python", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["requires_python"]);
        if (!("summary" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.summary", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["summary"] !== "string") fail("$.info.summary", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["summary"]);
        if (!("version" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.version", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["version"] !== "string") fail("$.info.version", "string", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["version"]);
        if (!("yanked" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.yanked", "present", undefined);
          if (typeof ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["yanked"] !== "boolean") fail("$.info.yanked", "boolean", ((value as Record<string, unknown>)["info"] as Record<string, unknown>)["yanked"]);
        if (!("yanked_reason" in ((value as Record<string, unknown>)["info"] as object))) fail("$.info.yanked_reason", "present", undefined);
      }
    if (!("last_serial" in (value as object))) fail("$.last_serial", "present", undefined);
      if (typeof (value as Record<string, unknown>)["last_serial"] !== "number") fail("$.last_serial", "number", (value as Record<string, unknown>)["last_serial"]);
    if (!("ownership" in (value as object))) fail("$.ownership", "present", undefined);
      if (!isObject((value as Record<string, unknown>)["ownership"])) fail("$.ownership", "object", (value as Record<string, unknown>)["ownership"]);
      if (isObject((value as Record<string, unknown>)["ownership"])) {
        if (!("organization" in ((value as Record<string, unknown>)["ownership"] as object))) fail("$.ownership.organization", "present", undefined);
        if (!("roles" in ((value as Record<string, unknown>)["ownership"] as object))) fail("$.ownership.roles", "present", undefined);
          if (!Array.isArray(((value as Record<string, unknown>)["ownership"] as Record<string, unknown>)["roles"])) fail("$.ownership.roles", "array", ((value as Record<string, unknown>)["ownership"] as Record<string, unknown>)["roles"]);
          if (Array.isArray(((value as Record<string, unknown>)["ownership"] as Record<string, unknown>)["roles"])) for (const item2 of ((value as Record<string, unknown>)["ownership"] as Record<string, unknown>)["roles"] as unknown[]) {
            if (!isObject(item2)) fail("$.ownership.roles[]", "object", item2);
            if (isObject(item2)) {
              if (!("role" in (item2 as object))) fail("$.ownership.roles[].role", "present", undefined);
                if (typeof (item2 as Record<string, unknown>)["role"] !== "string") fail("$.ownership.roles[].role", "string", (item2 as Record<string, unknown>)["role"]);
              if (!("user" in (item2 as object))) fail("$.ownership.roles[].user", "present", undefined);
                if (typeof (item2 as Record<string, unknown>)["user"] !== "string") fail("$.ownership.roles[].user", "string", (item2 as Record<string, unknown>)["user"]);
            }
          }
      }
    if (!("releases" in (value as object))) fail("$.releases", "present", undefined);
      if (!isObject((value as Record<string, unknown>)["releases"])) fail("$.releases", "object", (value as Record<string, unknown>)["releases"]);
      if (isObject((value as Record<string, unknown>)["releases"])) for (const entry1 of Object.values((value as Record<string, unknown>)["releases"] as Record<string, unknown>)) {
        if (!Array.isArray(entry1)) fail("$.releases.*", "array", entry1);
        if (Array.isArray(entry1)) for (const item2 of entry1 as unknown[]) {
          if (!isObject(item2)) fail("$.releases.*[]", "object", item2);
          if (isObject(item2)) {
            if (!("comment_text" in (item2 as object))) fail("$.releases.*[].comment_text", "present", undefined);
              if ((item2 as Record<string, unknown>)["comment_text"] !== null && typeof (item2 as Record<string, unknown>)["comment_text"] !== "string") fail("$.releases.*[].comment_text", "string", (item2 as Record<string, unknown>)["comment_text"]);
            if (!("core-metadata" in (item2 as object))) fail("$.releases.*[].core-metadata", "present", undefined);
            if (!("digests" in (item2 as object))) fail("$.releases.*[].digests", "present", undefined);
              if (!isObject((item2 as Record<string, unknown>)["digests"])) fail("$.releases.*[].digests", "object", (item2 as Record<string, unknown>)["digests"]);
              if (isObject((item2 as Record<string, unknown>)["digests"])) {
                if (!("blake2b_256" in ((item2 as Record<string, unknown>)["digests"] as object))) fail("$.releases.*[].digests.blake2b_256", "present", undefined);
                if (!("md5" in ((item2 as Record<string, unknown>)["digests"] as object))) fail("$.releases.*[].digests.md5", "present", undefined);
                if (!("sha256" in ((item2 as Record<string, unknown>)["digests"] as object))) fail("$.releases.*[].digests.sha256", "present", undefined);
              }
            if (!("downloads" in (item2 as object))) fail("$.releases.*[].downloads", "present", undefined);
              if (typeof (item2 as Record<string, unknown>)["downloads"] !== "number") fail("$.releases.*[].downloads", "number", (item2 as Record<string, unknown>)["downloads"]);
            if (!("filename" in (item2 as object))) fail("$.releases.*[].filename", "present", undefined);
              if (typeof (item2 as Record<string, unknown>)["filename"] !== "string") fail("$.releases.*[].filename", "string", (item2 as Record<string, unknown>)["filename"]);
            if (!("has_sig" in (item2 as object))) fail("$.releases.*[].has_sig", "present", undefined);
              if (typeof (item2 as Record<string, unknown>)["has_sig"] !== "boolean") fail("$.releases.*[].has_sig", "boolean", (item2 as Record<string, unknown>)["has_sig"]);
            if (!("md5_digest" in (item2 as object))) fail("$.releases.*[].md5_digest", "present", undefined);
              if (typeof (item2 as Record<string, unknown>)["md5_digest"] !== "string") fail("$.releases.*[].md5_digest", "string", (item2 as Record<string, unknown>)["md5_digest"]);
            if (!("packagetype" in (item2 as object))) fail("$.releases.*[].packagetype", "present", undefined);
              if (typeof (item2 as Record<string, unknown>)["packagetype"] !== "string") fail("$.releases.*[].packagetype", "string", (item2 as Record<string, unknown>)["packagetype"]);
            if (!("python_version" in (item2 as object))) fail("$.releases.*[].python_version", "present", undefined);
              if (typeof (item2 as Record<string, unknown>)["python_version"] !== "string") fail("$.releases.*[].python_version", "string", (item2 as Record<string, unknown>)["python_version"]);
            if (!("requires_python" in (item2 as object))) fail("$.releases.*[].requires_python", "present", undefined);
              if ((item2 as Record<string, unknown>)["requires_python"] !== null && typeof (item2 as Record<string, unknown>)["requires_python"] !== "string") fail("$.releases.*[].requires_python", "string", (item2 as Record<string, unknown>)["requires_python"]);
            if (!("size" in (item2 as object))) fail("$.releases.*[].size", "present", undefined);
              if (typeof (item2 as Record<string, unknown>)["size"] !== "number") fail("$.releases.*[].size", "number", (item2 as Record<string, unknown>)["size"]);
            if (!("upload_time" in (item2 as object))) fail("$.releases.*[].upload_time", "present", undefined);
              if (typeof (item2 as Record<string, unknown>)["upload_time"] !== "string") fail("$.releases.*[].upload_time", "string", (item2 as Record<string, unknown>)["upload_time"]);
            if (!("upload_time_iso_8601" in (item2 as object))) fail("$.releases.*[].upload_time_iso_8601", "present", undefined);
              if (typeof (item2 as Record<string, unknown>)["upload_time_iso_8601"] !== "string") fail("$.releases.*[].upload_time_iso_8601", "string", (item2 as Record<string, unknown>)["upload_time_iso_8601"]);
            if (!("url" in (item2 as object))) fail("$.releases.*[].url", "present", undefined);
              if (typeof (item2 as Record<string, unknown>)["url"] !== "string") fail("$.releases.*[].url", "string", (item2 as Record<string, unknown>)["url"]);
            if (!("yanked" in (item2 as object))) fail("$.releases.*[].yanked", "present", undefined);
              if (typeof (item2 as Record<string, unknown>)["yanked"] !== "boolean") fail("$.releases.*[].yanked", "boolean", (item2 as Record<string, unknown>)["yanked"]);
            if (!("yanked_reason" in (item2 as object))) fail("$.releases.*[].yanked_reason", "present", undefined);
              if ((item2 as Record<string, unknown>)["yanked_reason"] !== null && typeof (item2 as Record<string, unknown>)["yanked_reason"] !== "string") fail("$.releases.*[].yanked_reason", "string", (item2 as Record<string, unknown>)["yanked_reason"]);
          }
        }
      }
    if (!("urls" in (value as object))) fail("$.urls", "present", undefined);
      if (!Array.isArray((value as Record<string, unknown>)["urls"])) fail("$.urls", "array", (value as Record<string, unknown>)["urls"]);
      if (Array.isArray((value as Record<string, unknown>)["urls"])) for (const item1 of (value as Record<string, unknown>)["urls"] as unknown[]) {
        if (!isObject(item1)) fail("$.urls[]", "object", item1);
        if (isObject(item1)) {
          if (!("comment_text" in (item1 as object))) fail("$.urls[].comment_text", "present", undefined);
          if (!("core-metadata" in (item1 as object))) fail("$.urls[].core-metadata", "present", undefined);
          if (!("digests" in (item1 as object))) fail("$.urls[].digests", "present", undefined);
            if (!isObject((item1 as Record<string, unknown>)["digests"])) fail("$.urls[].digests", "object", (item1 as Record<string, unknown>)["digests"]);
            if (isObject((item1 as Record<string, unknown>)["digests"])) {
              if (!("blake2b_256" in ((item1 as Record<string, unknown>)["digests"] as object))) fail("$.urls[].digests.blake2b_256", "present", undefined);
                if (typeof ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["blake2b_256"] !== "string") fail("$.urls[].digests.blake2b_256", "string", ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["blake2b_256"]);
              if (!("md5" in ((item1 as Record<string, unknown>)["digests"] as object))) fail("$.urls[].digests.md5", "present", undefined);
                if (typeof ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["md5"] !== "string") fail("$.urls[].digests.md5", "string", ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["md5"]);
              if (!("sha256" in ((item1 as Record<string, unknown>)["digests"] as object))) fail("$.urls[].digests.sha256", "present", undefined);
                if (typeof ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["sha256"] !== "string") fail("$.urls[].digests.sha256", "string", ((item1 as Record<string, unknown>)["digests"] as Record<string, unknown>)["sha256"]);
            }
          if (!("downloads" in (item1 as object))) fail("$.urls[].downloads", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["downloads"] !== "number") fail("$.urls[].downloads", "number", (item1 as Record<string, unknown>)["downloads"]);
          if (!("filename" in (item1 as object))) fail("$.urls[].filename", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["filename"] !== "string") fail("$.urls[].filename", "string", (item1 as Record<string, unknown>)["filename"]);
          if (!("has_sig" in (item1 as object))) fail("$.urls[].has_sig", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["has_sig"] !== "boolean") fail("$.urls[].has_sig", "boolean", (item1 as Record<string, unknown>)["has_sig"]);
          if (!("md5_digest" in (item1 as object))) fail("$.urls[].md5_digest", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["md5_digest"] !== "string") fail("$.urls[].md5_digest", "string", (item1 as Record<string, unknown>)["md5_digest"]);
          if (!("packagetype" in (item1 as object))) fail("$.urls[].packagetype", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["packagetype"] !== "string") fail("$.urls[].packagetype", "string", (item1 as Record<string, unknown>)["packagetype"]);
          if (!("python_version" in (item1 as object))) fail("$.urls[].python_version", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["python_version"] !== "string") fail("$.urls[].python_version", "string", (item1 as Record<string, unknown>)["python_version"]);
          if (!("requires_python" in (item1 as object))) fail("$.urls[].requires_python", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["requires_python"] !== "string") fail("$.urls[].requires_python", "string", (item1 as Record<string, unknown>)["requires_python"]);
          if (!("size" in (item1 as object))) fail("$.urls[].size", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["size"] !== "number") fail("$.urls[].size", "number", (item1 as Record<string, unknown>)["size"]);
          if (!("upload_time" in (item1 as object))) fail("$.urls[].upload_time", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["upload_time"] !== "string") fail("$.urls[].upload_time", "string", (item1 as Record<string, unknown>)["upload_time"]);
          if (!("upload_time_iso_8601" in (item1 as object))) fail("$.urls[].upload_time_iso_8601", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["upload_time_iso_8601"] !== "string") fail("$.urls[].upload_time_iso_8601", "string", (item1 as Record<string, unknown>)["upload_time_iso_8601"]);
          if (!("url" in (item1 as object))) fail("$.urls[].url", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["url"] !== "string") fail("$.urls[].url", "string", (item1 as Record<string, unknown>)["url"]);
          if (!("yanked" in (item1 as object))) fail("$.urls[].yanked", "present", undefined);
            if (typeof (item1 as Record<string, unknown>)["yanked"] !== "boolean") fail("$.urls[].yanked", "boolean", (item1 as Record<string, unknown>)["yanked"]);
          if (!("yanked_reason" in (item1 as object))) fail("$.urls[].yanked_reason", "present", undefined);
        }
      }
    if (!("vulnerabilities" in (value as object))) fail("$.vulnerabilities", "present", undefined);
      if (!Array.isArray((value as Record<string, unknown>)["vulnerabilities"])) fail("$.vulnerabilities", "array", (value as Record<string, unknown>)["vulnerabilities"]);
  }
  return value as PypiResponse;
}

void fail;
void isObject;
