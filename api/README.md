# Streamhub Audience Analytics API (mock)

A small, deterministic, read-only HTTP API that serves TV/video audience-analytics data - channels,
programmes and daily audience metrics - from committed JSON files. It exists to be the **system under
test** for the Playwright + Cucumber API suite in `tests/features/api`, so its first design goal is to
be predictable and precisely specified rather than feature-rich.

- Stack: Node 20+, Express 5, zod 4, TypeScript (strict). No database.
- Contract: [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1) is kept accurate to the implementation.
- Data: [`data/channels.json`](./data/channels.json), [`data/programmes.json`](./data/programmes.json),
  [`data/audience.json`](./data/audience.json) - 8 channels, 40 programmes, 240 daily audience rows.

## Running it

```bash
npm run api:start            # http://localhost:4010 (PORT overrides it; the only env var the API reads)
curl -s localhost:4010/health
```

The Cucumber `@api` hooks start their own instance automatically (see `tests/support/api-server.ts`), so
nothing needs to be running before `npm run test:api`. The server shuts down cleanly on `SIGTERM`/`SIGINT`.

## Endpoints

All responses are `application/json; charset=utf-8` and carry an `X-Request-Id` header (the incoming
header is echoed when it is well-formed, otherwise a UUID is generated). Every request is logged to
stdout as `timestamp method url status ms id=<request id>`.

| Method | Path                       | Purpose                                             | Query parameters                                                                                                                                             |
| ------ | -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/health`                  | Liveness probe                                      | - (query parameters are ignored so probes may append cache-busters)                                                                                          |
| GET    | `/api/v1/channels`         | List channels (not paginated)                       | `country` (2 uppercase letters), `type` (`linear`\|`vod`), `sort` (`name`\|`-name`\|`launchedAt`\|`-launchedAt`, default `name`)                             |
| GET    | `/api/v1/channels/:id`     | One channel                                         | - (any query parameter is a `400`)                                                                                                                           |
| GET    | `/api/v1/programmes`       | Search, sort and page through programmes            | `channelId`, `genre`, `q` (2-50 chars, case-insensitive title substring), `minRating` (0-10), `sort` (`title`\|`firstAiredAt`\|`rating`, `-` prefix for desc, default `title`), `page` (>= 1, default 1), `limit` (1-50, default 10) |
| GET    | `/api/v1/programmes/:id`   | One programme with its channel `{ id, name }`       | - (any query parameter is a `400`)                                                                                                                           |
| GET    | `/api/v1/audience/summary` | Aggregate daily audience rows over a date range     | `from`, `to` (required, `YYYY-MM-DD`, `from <= to`, span <= 366 days), `channelId` (optional), `groupBy` (`channel`\|`genre`\|`date`, default `channel`)        |

Ids: channels match `^ch_\d{3}$`, programmes match `^prg_\d{3}$`.

### Examples

```bash
curl -s "localhost:4010/health"
```

```json
{ "status": "ok", "uptimeSeconds": 42, "version": "1.0.0" }
```

```bash
curl -s "localhost:4010/api/v1/channels?country=GB&type=vod"
```

```json
{
  "data": [{ "id": "ch_007", "name": "Kidsville", "country": "GB", "type": "vod", "launchedAt": "2021-09-09" }],
  "meta": { "total": 1 }
}
```

```bash
curl -s "localhost:4010/api/v1/programmes?q=morning&limit=2"
```

```json
{
  "data": [
    { "id": "prg_001", "channelId": "ch_001", "title": "Morning Brief", "genre": "news", "durationMinutes": 60, "firstAiredAt": "2016-01-11", "rating": 7.4 },
    { "id": "prg_026", "channelId": "ch_006", "title": "Morning Glory Hour", "genre": "news", "durationMinutes": 120, "firstAiredAt": "2005-07-04", "rating": 7.2 }
  ],
  "meta": { "page": 1, "limit": 2, "total": 3, "totalPages": 2, "sort": "title" }
}
```

```bash
curl -s "localhost:4010/api/v1/programmes/prg_001"
```

```json
{
  "id": "prg_001",
  "channelId": "ch_001",
  "title": "Morning Brief",
  "genre": "news",
  "durationMinutes": 60,
  "firstAiredAt": "2016-01-11",
  "rating": 7.4,
  "channel": { "id": "ch_001", "name": "Streamhub One" }
}
```

```bash
curl -s "localhost:4010/api/v1/audience/summary?from=2026-01-01&to=2026-03-31&groupBy=genre"
```

```json
{
  "data": [
    { "key": "comedy", "label": "Comedy", "totalViewers": 8756889, "avgWatchTimeMinutes": 21.6, "avgCompletionRate": 0.716, "programmes": 4 },
    { "key": "documentary", "label": "Documentary", "totalViewers": 11149455, "avgWatchTimeMinutes": 37.5, "avgCompletionRate": 0.803, "programmes": 6 }
  ],
  "meta": { "from": "2026-01-01", "to": "2026-03-31", "groupBy": "genre", "rows": 240 }
}
```

(`data` is truncated above; the real response has one row per genre.)

### Semantics worth knowing when writing tests

- **Filtering, then sorting, then paging.** `meta.total` and `meta.totalPages` describe the filtered set.
  A `page` beyond `totalPages` is `200` with empty `data`; `totalPages` is `0` when nothing matches.
- **Sorting is total and deterministic.** Strings compare by UTF-16 code unit (not locale-aware, so the
  order is identical on every machine) and ties are always broken by `id` ascending, even for descending
  sorts. Example: `sort=-rating` lists the three programmes rated 8.4 as `prg_006, prg_017, prg_040`.
- **`q` is trimmed** before the 2-50 character check and matched case-insensitively against `title`.
- **`minRating` is inclusive.**
- **Summary aggregation.** `from`/`to` are inclusive. `totalViewers` is a sum; `avgWatchTimeMinutes`
  (1 dp) and `avgCompletionRate` (3 dp) are plain arithmetic means over the matched daily rows, not
  viewer-weighted; `programmes` counts distinct programmes; `meta.rows` is the number of daily rows that
  were aggregated. `label` is the channel name, the genre in Title Case, or the date. Rows are sorted by
  `key` ascending. A well-formed `channelId` with no data yields `200` with `data: []` - filters never 404.
- **Dates must be real.** `2026-02-30` is rejected, as are `from > to` and spans over 366 days.

## Error envelope

Every non-2xx response has exactly this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "page", "message": "must be an integer" },
      { "field": "limit", "message": "must be at most 50" },
      { "field": "foo", "message": "is not a recognised query parameter" }
    ]
  }
}
```

| Status | `code`               | When                                                                              | Extras                              |
| ------ | -------------------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| 400    | `VALIDATION_ERROR`   | Any invalid or unknown query parameter (`/health` excepted); a path that cannot be percent-decoded | `details[]` lists **every** problem |
| 400    | `INVALID_ID`         | Path id does not match its pattern (`ch_1`, `CH_001`, `prg_1`)                    | `details[]` with `field: "id"`      |
| 404    | `NOT_FOUND`          | Well-formed id with no resource, or an unknown route (`"Route not found"`)        |                                     |
| 405    | `METHOD_NOT_ALLOWED` | Known route, any method other than `GET` (`HEAD` is served with `GET` semantics) | `Allow: GET` header                 |
| 500    | `INTERNAL_ERROR`     | An unexpected exception. Logged with the request id; the process never crashes    |                                     |

Numeric query parameters are coerced explicitly and strictly: `page=1.5`, `page=abc`, `page=0`,
`limit=51`, `minRating=abc` and `minRating=11` are all `400`. Repeating a parameter (`?genre=a&genre=b`)
is rejected too, since the value is then an array rather than a string.

## Design notes

**Why strict query parameters?** A typo such as `?genere=news` silently returning the unfiltered list is
the most expensive kind of bug for an analytics consumer: the request succeeds, the numbers are wrong,
and nobody notices. Rejecting unknown parameters (`z.object(...).strict()`) turns that into an
immediate, explicit `400`. Reporting *every* invalid field at once, rather than the first one, means a
client fixes a request in one round-trip instead of several.

**Why validate ids before looking them up?** `ch_1` and `ch_999` are different mistakes. The first is a
client bug (the id can never be valid) and deserves a `400 INVALID_ID`; the second is a well-formed
reference that does not exist, which is `404 NOT_FOUND`. Collapsing both into `404` would hide client
bugs, and it would also let callers probe the id space with arbitrary strings. The check is a regex, so
it costs nothing.

**Why 405 rather than 404 for the wrong method?** `POST /api/v1/channels` reaches a real route; telling
the caller "not found" is misleading, and `405` plus an `Allow` header is what HTTP specifies for this
case. It also makes the read-only nature of the API explicit and testable. Each route registers its
`GET` handler and then an `.all()` fallback, so the behaviour is uniform without a central method table.
`OPTIONS` is treated like any other non-`GET` method: CORS preflight is out of scope for a local mock.

**Why an error envelope with codes?** Tests (and real clients) should branch on a stable machine-readable
`code`, not on message text that may be reworded. The `message` is for humans; `details[]` is for forms
and for assertions about *which* field failed.

**Why validate the dataset at startup?** The JSON files are hand-maintained. `data/schemas.ts` checks
their shape, and `data/dataset.ts` checks referential integrity (programme -> channel, audience row ->
programme) and uniqueness. A bad fixture therefore fails the process at boot with a precise message,
rather than surfacing as a confusing `500` - or a silently wrong aggregate - during a test run. It also
lets the services treat a programme's channel as guaranteed to exist.

**Why are handlers synchronous?** The repository is in memory, so there is nothing to await. Express 5
forwards rejected promises to the error middleware natively, so the handlers can become `async` as-is if
the repository is ever swapped for a database (the `Repository` interface is written with that in mind).

**Why code-unit string ordering?** Locale-aware collation (`localeCompare`, `Intl.Collator`) depends on
the ICU build of the runtime. Code-unit ordering is the same everywhere, which is what a test oracle
needs; all fixture titles are Title Case, so the practical result is alphabetical.

**Why echo `X-Request-Id` only when well-formed?** Echoing arbitrary header values into logs and
responses is a log-injection vector. Anything outside `^[A-Za-z0-9._-]{1,128}$` is replaced with a UUID.

## Dataset

`channels.json` and `programmes.json` are hand-authored. `audience.json` is produced by
`data/generate-audience.ts` with a fixed seed (channel reach x genre weight x rating, weekend uplift for
sport and kids, completion rate that tracks rating), so it is reproducible:

```bash
npx ts-node --transpile-only api/data/generate-audience.ts   # rewrites data/audience.json byte-for-byte
```

The committed JSON is the source of truth. Fixture features that tests can lean on:

- Three titles contain "Morning" (`prg_001`, `prg_014`, `prg_026`); two contain "Late".
- Three programmes share rating 8.4 (`prg_006`, `prg_017`, `prg_040`) - a tie-break case.
- Audience rows exist on both window boundaries, 2026-01-01 (`prg_001`) and 2026-03-31 (`prg_005`).
- Every programme has 4-8 daily rows; every channel has 5 programmes; `Canal Lumière` exercises UTF-8.
- `GET /api/v1/channels?country=FR&type=linear` legitimately returns an empty list.

## Layout

```
api/
  openapi.yaml            contract (OpenAPI 3.1)
  data/                   JSON fixtures + the seeded generator for audience.json
  src/
    server.ts             process entry point; the only module that reads process.env (PORT)
    app.ts                createApp(): wires middleware, routes, 404 and the error handler
    types.ts              domain types shared by data, services and validation
    errors.ts             ApiError + the error envelope
    data/                 schemas.ts (file shape), dataset.ts (load + integrity), repository.ts (typed access)
    validation/           zod query schemas per endpoint, param builders, issue -> details mapping
    services/             filtering / sorting / paging / aggregation, free of HTTP concerns
    routes/               thin Express routers: parse -> service -> res.json
    middleware/           request id + content type, request logger, 404/405, error handler
    utils/dates.ts        calendar-valid ISO date parsing
```
