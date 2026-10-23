// Types inferred from observed responses (not from documentation).

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
