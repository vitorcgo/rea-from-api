# Validation: PASSED

Integration: `.\examples\pypi\integration` · 2026-10-23T09:08:14.671Z · live: true

| Check | Status | ms |
|---|---|---|
| typecheck | passed | 1442 |
| offline tests (recorded fixtures) | passed | 1498 |
| live smoke tests | passed | 828 |
| usage example | passed | 326 |

## offline tests (recorded fixtures)

`C:\Program Files\nodejs\node.exe --test tests/schemas.test.ts tests/client.test.ts`

```
✔ getPypiByProjectVersion returns validated data (33.6165ms)
✔ getPypi returns validated data (8.804ms)
✔ retries transient 503 then succeeds (280.5832ms)
✔ gives up after maxRetries with HttpError (806.2376ms)
✔ serves repeated calls from cache (16.2034ms)
✔ PypiByProjectVersionResponse accepts the recorded response (6.715ms)
✔ PypiByProjectVersionResponse rejects a drifted response (0.6902ms)
✔ PypiResponse accepts the recorded response (3.9196ms)
✔ PypiResponse rejects a drifted response (0.2763ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1418.2814
```

## live smoke tests

`C:\Program Files\nodejs\node.exe --test tests/live.test.ts`

```
✔ live: getPypiByProjectVersion (122.4034ms)
✔ live: getPypi (427.9856ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 749.6643
```

## usage example

`C:\Program Files\nodejs\node.exe examples/basic.ts`

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
