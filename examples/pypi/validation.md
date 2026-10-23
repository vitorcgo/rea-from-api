# Validation — PASSED

Integration: `/home/user/rea-from-api/examples/pypi/integration` · 2026-10-23T07:08:47.139Z · live: true

| Check | Status | ms |
|---|---|---|
| typecheck | passed | 1096 |
| offline tests (recorded fixtures) | passed | 1312 |
| live smoke tests | passed | 744 |
| usage example | passed | 305 |

## offline tests (recorded fixtures)

`/opt/node22/bin/node --test tests/schemas.test.ts tests/client.test.ts`

```
TAP version 13
# Subtest: getPypiByProjectVersion returns validated data
ok 1 - getPypiByProjectVersion returns validated data
  ---
  duration_ms: 36.643663
  type: 'test'
  ...
# Subtest: getPypi returns validated data
ok 2 - getPypi returns validated data
  ---
  duration_ms: 10.58867
  type: 'test'
  ...
# Subtest: retries transient 503 then succeeds
ok 3 - retries transient 503 then succeeds
  ---
  duration_ms: 257.611676
  type: 'test'
  ...
# Subtest: gives up after maxRetries with HttpError
ok 4 - gives up after maxRetries with HttpError
  ---
  duration_ms: 757.480775
  type: 'test'
  ...
# Subtest: serves repeated calls from cache
ok 5 - serves repeated calls from cache
  ---
  duration_ms: 4.396664
  type: 'test'
  ...
# Subtest: PypiByProjectVersionResponse accepts the recorded response
ok 6 - PypiByProjectVersionResponse accepts the recorded response
  ---
  duration_ms: 1.994772
  type: 'test'
  ...
# Subtest: PypiByProjectVersionResponse rejects a drifted response
ok 7 - PypiByProjectVersionResponse rejects a drifted response
  ---
  duration_ms: 0.490117
  type: 'test'
  ...
# Subtest: PypiResponse accepts the recorded response
ok 8 - PypiResponse accepts the recorded response
  ---
  duration_ms: 2.512303
  type: 'test'
  ...
# Subtest: PypiResponse rejects a drifted response
ok 9 - PypiResponse rejects a drifted response
  ---
  duration_ms: 0.215425
  type: 'test'
  ...
1..9
# tests 9
# suites 0
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1270.033855
```

## live smoke tests

`/opt/node22/bin/node --test tests/live.test.ts`

```
TAP version 13
# Subtest: live: getPypiByProjectVersion
ok 1 - live: getPypiByProjectVersion
  ---
  duration_ms: 99.932134
  type: 'test'
  ...
# Subtest: live: getPypi
ok 2 - live: getPypi
  ---
  duration_ms: 431.549262
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 700.084814
```

## usage example

`/opt/node22/bin/node examples/basic.ts`

```
[ok] https://pypi.org/pypi/requests/2.32.3/json 200
{
  "info": {
    "author": "Kenneth Reitz",
    "author_email": "me@kennethreitz.org",
    "bugtrack_url": null,
    "classifiers": [
      "Development Status :: 5 - Production/Stable",
      "Environment :: Web Environment",
      "Intended Audience :: Developers",
      "License :: OSI Approved :: Apache Software License",
      "Natural Language :: English",
      "Operating System :: OS Independent",
      "Programming Language :: Python",
      "Programming Language :: Python :: 3",
      "Programming Language :: Python :: 3 :: Only",
      "Programming Language :: Python :: 3.10",
      "Programming Language :: Python :: 3.11",
      "Programming Language :: Python :: 3.12",
      "Programming Language :: Python :: 3.8",
      "Programming Language :: Python :: 3.9",
      "Programming Language :: Python :: Implementation :: CPython",
      "Programming Language :: Python :: Implementation :: PyPy",
      "Topic :: Internet :: WWW/HTTP",
      "Topic :: Software Development :: Libraries"
    ],
    "description": "# Requests\n\n**Requests** is a simple, yet elegant, HTTP library.\n\n'''python\n>>> import requests\n>>> r = requests.get('https://httpbin.org/basic-auth/user/pass', auth=('user', 'pass'))\n>>> r.status_code\n200\n>>> r.headers['content-type']\n'application/json; charset=utf8'\n>>> r.encoding\n'utf-8'\n>>> r.text\n'{\"authenticated\": true, ...'\n>>> r.json()\n{'authenticated': True, ...}\n'''\n\nRequests allows you to send HTTP/1.1 requests extremely easily. There’s no need to manually add query strings to your URLs, or to form-encode your `PUT` & `POST` data — but nowadays, just use the `json` method!\n\nRequests is one of the most downloaded Python packages today, pulling in around `30M downloads / week`— according to GitHub, Requests is currently [depended upon](https://github.com/psf/requests/network/dependents?package_id=UGFja2FnZS01NzA4OTExNg%3D%3D) by `1,000,000+` repositories. You may certainly put your trust in this code.\n\n[![Downloads
```
