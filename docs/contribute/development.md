---
title: Development setup
description: Clone, make dev, seed — and the hot-reload stack.
---

# Development setup

```bash
git clone https://github.com/yegamble/vidra.git
cd vidra
make dev                  # bootstrap + backend stack: postgres, redis, migrate, api :8080, search :8081

# Frontend, in another shell — Next.js dev with HMR against the live backend:
cd vidra-user && npm ci && NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 npm run dev

make seed                 # demo account (demo@vidra.local / demo-password-123) + @demo channel
```

`bootstrap.sh` clones the three sibling checkouts — `vidra-core`, `vidra-user`,
`vidra-search` — automatically. They are independent git checkouts, git-ignored
by the meta-repo. It is idempotent: it clones each component if missing,
otherwise `git pull --ff-only`.

To run everything in containers, frontend included, use `make up` instead.

:::note The local stack is not a deployment
It disables the global API rate limiter by default. Re-enable it with
`RATE_LIMIT_ENABLED=true make dev`.
:::

## Prerequisites

- **Docker** with Compose **2.20 or newer** (the root compose uses `include:`
  and profiles).
- **GNU make** and **git**.
- **Node.js 20 or newer** and npm, for host-side frontend development.
- **Go 1.26**, only if you build outside the containers.

## Hot reload

`make dev-hot` runs the **whole stack in Docker with live reload** — no image
rebuilds while developing:

- **api** — `air` on the bind-mounted `vidra-core/` tree recompiles and restarts
  in roughly 1–3 s, on the same `:8080`.
- **search** — the same `air` pattern on `:8081`. It shares the core Postgres
  (schema `search`) and Redis (DB 1), migrated by a one-shot `search-migrate`
  service.
- **frontend** — `next dev` on the bind-mounted `vidra-user/` HMRs instantly;
  `node_modules` and `.next` live in named volumes.

**First run is slow, once**: volume seed, `go mod download`, cold compile — a few
minutes. Later starts are fast.

```bash
make dev-hot
make dev-hot-logs
make dev-hot-down     # stop; volumes preserved
make dev-hot-nuke     # DESTRUCTIVE: delete db data and caches
```

:::warning `NEXT_PUBLIC_API_BASE_URL` is a runtime value here
It must be a **browser-reachable** host URL, not `http://api:8080`. If you
override `HTTP_PORT`, match it:

```bash
HTTP_PORT=8088 NEXT_PUBLIC_API_BASE_URL=http://localhost:8088 make dev-hot
```
:::

The dev overlay only applies when `-f docker-compose.dev.yml` is passed;
`make up`, `make dev` and both Dockerfiles are untouched.

## Tests

```bash
make test          # ALL THREE repos' canonical CI gates:
                   #   vidra-core   make ci
                   #   vidra-search make ci
                   #   vidra-user   npm run ci
make e2e-backed    # backend-backed Playwright suite against vidra-core's own
                   # compose stack (no search service)
```

Each repo's `make ci` / `npm run ci` is the gate CI runs — matching it locally is
the point of the target.

## Working across the API contract

`vidra-core/api/openapi.yaml` is the source of truth. `vidra-user` regenerates
its client from it with `npm run codegen`; never hand-edit the generated shapes.
Locally the sibling `../vidra-core` checkout is used; in CI the spec is fetched
from the public repo.

A breaking change spans two repos with no atomic commit — stage it back-compat:
land the additive change in `vidra-core`, update `vidra-user`, remove the old
endpoint in a later `vidra-core` change. See [REST API](../reference/rest-api.md).

## Other useful targets

```bash
make logs        # tail all service logs
make down        # stop; volumes preserved
make nuke        # DESTRUCTIVE: stop and delete data volumes. Prompts, or CONFIRM=1
make ipfs-live   # core stack + live public IPFS mirror + separate private mirror
make env-check   # which env template the compose commands would use
make help        # every target
```

## The migration importer

`cmd/peertube-import` is not built by the Dockerfile and is not in the release
assets. Build it yourself when you need it:

```bash
cd vidra-core
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o peertube-import ./cmd/peertube-import
```

## Licence

Vidra is free software under the
[GNU Affero General Public License v3.0](https://github.com/yegamble/vidra/blob/main/LICENSE).
Contributions are under the same licence.
