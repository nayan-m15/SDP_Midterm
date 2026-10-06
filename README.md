# SDP_Midterm

A full-stack dashboard for measuring how a Git repository evolves. RAT analyzes non-merge commits and reports file, directory, repository, commit-set, and author metrics.

## Features

- Imports a working-tree ZIP containing `.git`, or deeply clones an HTTP(S) Git URL.
- Uses an explicit Git reference, defaulting to `HEAD`.
- Calculates added lines, removed lines, growth, churn, modifications, modification frequency, and churn rate.
- Aggregates file changes through every ancestor directory and the repository root.
- Reports raw-author modifications, churn, and ownership.
- Uses Git's 50% rename detection, handles deleted files, compares root commits with the empty tree, excludes merge commits, and ignores binary-file line counts.
- Provides summary cards, hotspot and ownership charts, sortable object tables, author drill-downs, and per-commit details.

This submission targets the cumulative **50% requirements tier**. Date/manual commit filtering, `.mailmap` or manual author merging, and simultaneous multi-repository support are intentionally deferred.

## Prerequisites

- Node.js 20 or newer
- npm
- Git CLI

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies API calls to the Express server on port `3001`.

For a production build:

```bash
npm run build
npm start
```

The Express server serves the built client from `dist/client`.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The test suite creates isolated temporary Git repositories and covers root commits, edits, deletions, binary files, pure renames, nested directories, multiple authors, ZIP ingestion, API behavior, and every metric formula. It does not require internet access.

For an optional public-repository smoke test, run the app and import:

```text
https://github.com/DaveGamble/cJSON.git
```

Redis and Git have much larger histories and may exceed the time/memory limits appropriate to the selected rubric tier.

## Metric definitions

For one object in one commit:

```text
growth = added lines - removed lines
churn  = added lines + removed lines
```

For an object over the analyzed commit set `H`:

```text
added                 = sum of per-commit additions
removed               = sum of per-commit removals
growth                = sum of per-commit growth
churn                 = sum of per-commit churn
modifications         = commits where object churn > 0
modificationFrequency = modifications / |H|
churnRate              = churn / |H|
```

For author `A` and object `O`:

```text
authorModifications = modifications to O from commits authored by A
authorChurn         = churn on O from commits authored by A
ownership           = authorChurn / total churn on O
```

Zero denominators produce zero. Directory values aggregate all descendant file changes by adding each file delta once to every ancestor. Repository metrics are the root directory's metrics.

## Architecture

```text
React/Vite dashboard
        |
        v
Express validation and import API
        |
        +-- safe ZIP extraction
        +-- full HTTP(S) git clone
        |
        v
NUL-delimited git history extraction
(--no-merges, --root, --numstat, -M50%)
        |
        v
single-pass file/directory/author aggregation
        |
        v
in-memory active repository and analysis cache
```

Key modules:

- `src/server/services/ingestionService.ts`: bounded ZIP extraction and full clone preparation.
- `src/server/services/historyService.ts`: reference validation and robust Git history parsing.
- `src/server/services/metricsService.ts`: all metric formulas and hierarchy aggregation.
- `src/server/state/repositoryStore.ts`: one active repository and its cached analysis.
- `src/server/routes`: import, analysis, and commit-detail endpoints.
- `src/client/components`: ingestion and dashboard views.
- `src/shared/metrics.ts`: API and domain contracts shared by client and server.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Readiness check |
| `POST` | `/api/repositories/clone` | Import `{ "url": "https://…", "ref": "HEAD" }` |
| `POST` | `/api/repositories/upload` | Import multipart field `repository` and optional `ref` |
| `GET` | `/api/analysis` | Return active repository aggregates, authors, and commit summaries |
| `GET` | `/api/commits/:hash/metrics` | Return sparse metrics for one analyzed commit |

## Safety and limits

- Git commands use argument arrays without shell interpolation.
- Clone URLs are limited to credential-free HTTP(S).
- ZIP paths, symbolic links, extracted bytes, file counts, and upload bytes are validated.
- Imports use staging directories; a failed import leaves the previous valid analysis active.
- API errors do not expose raw Git stderr or server filesystem paths.

Defaults can be changed through:

| Environment variable | Default |
|---|---:|
| `PORT` | `3001` |
| `RAT_DATA_ROOT` | `.rat-data` |
| `RAT_UPLOAD_LIMIT_BYTES` | `52428800` |
| `RAT_EXTRACTED_LIMIT_BYTES` | `262144000` |
| `RAT_EXTRACTED_FILE_LIMIT` | `20000` |
| `RAT_GIT_TIMEOUT_MS` | `120000` |
| `RAT_GIT_MAX_OUTPUT_BYTES` | `268435456` |

## Assumptions and scope

- One repository is active at a time and is replaced only after a successful import.
- Analysis is in memory and is lost when the server exits.
- The commit set is all non-merge commits reachable from the selected reference.
- Authors are identified by their raw normalized `name <email>` pair; alias merging belongs to a higher rubric tier.
- Git numstat is authoritative for text-line counts, and Git's binary detection determines exclusion.