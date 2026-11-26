---
title: Docker services
description: Every compose service, the profile that starts it, and the port it uses.
---

# Docker services

The stack is one compose model assembled from several files. The meta-repo's
`docker-compose.yml` `include:`s `vidra-core/docker-compose.yml` and adds the
frontend, search and search-migrate services; `docker-compose.prod.yml` overlays
production behaviour on top.

Nothing is "always on". Every service belongs to a **profile**, and
`VIDRA_COMPOSE_PROFILES` in the env file decides which profiles a deploy
enables.

## Services by profile

| Service | Profile | Port | What it is |
|---|---|---|---|
| `api` | `core` | 8080 | The Go API. ffmpeg runs **inside** this container. |
| `postgres` | `core` | 5432 | PostgreSQL 18. Shared with search, in a separate schema. |
| `redis` | `core` | 6379 | Redis 8. Cache, rate limiting, dedup. |
| `migrate` | `core` | — | One-shot. Runs the api image's compiled-in `migrate up`. |
| `search` | `core` | 8081 | The search service. **Internal only**, HMAC-authenticated. |
| `search-migrate` | `core` | — | One-shot. The search service's own migrator and ledger. |
| `prep-volumes` | `core` | — | One-shot. Fixes volume ownership to uid 10001. |
| `frontend` | `frontend` | 3000 | The Next.js app. Reads its API origin at runtime. |
| `minio` | `storage` | 9000 | S3-compatible object storage, for developing against the S3 path. |
| `clamav` | `scan` | 3310 | Malware scanning of uploaded originals. Needs about 2 GB of RAM. |
| `whisper` | `captions` | 8090 | Automatic caption generation. |
| `worker` | `worker` | — | Background workers split off the api. See the warning below. |
| `rtmp` | `media` | 1935 | nginx-rtmp live ingest. **Bypasses the edge.** |
| `otel-collector` | `otel` | 4317 (gRPC), 4318 (HTTP) | OpenTelemetry collector. |
| `jaeger` | `otel` | 16686 | Trace UI. |
| `ipfs` | `ipfs`, `full` | 4001 swarm (TCP+UDP), 5001 API and 9090 gateway on loopback | Public IPFS mirror (Kubo). |
| `kubo-private` | `ipfs-private`, `ipfs-private-cluster` | 5002 API on loopback | Private swarm-keyed mirror. |
| `kubo-private-2` | `ipfs-private-cluster` | — | Second private node, for cluster work. |
| `ipfs-cluster-private` | `ipfs-private-cluster` | 9094 on loopback | IPFS Cluster REST API. |
| `caddy` | `edge` (production overlay) | 80, 443 | The only internet-facing service. |

Ports in that table are the **development** publishes. In production the overlay
resets almost all of them; see [Ports and services](../reference/ports.md) for
what is actually reachable where.

:::warning `worker` has no interlock
Setting `EXTRA_COMPOSE_PROFILES=worker` and `API_ROLE=api` moves every background
worker — ffmpeg included — out of the api container, which is what lets
`API_CPUS` shrink to a web-serving envelope. But `API_ROLE=api` with **no worker
container running** means nothing transcodes, imports or sweeps at all, and
nothing warns you. The single-container topology remains the default and the
supported one.
:::

## Never hand-spell the compose chain

```bash
# read the stack
./deploy/compose.sh ps
./deploy/compose.sh logs -f api
./deploy/compose.sh config -q     # render check

# another environment
ENV_FILE=env/staging.env ./deploy/compose.sh ps
```

`deploy/compose.sh` reads the **shape** of the stack — which overlays, which
profiles — out of the env file, exactly as `deploy.sh`, `rollback.sh`,
`restore.sh` and `backup.sh` do; they all share `deploy/lib.sh`.

A typed-out `-f … --profile …` chain is a copy that drifts. An operator on
managed Postgres who types the plain two-file chain gets a render containing the
**bundled** postgres, so `config -q` goes green for a stack that is not the one
running, and `up -d` starts a second, empty database next to the managed one.

`compose.sh` gates **nothing** — use it to read and to stop; use `deploy.sh` to
change.

## Two compose gotchas that bite silently

**The explicit `-f` chain disables `docker-compose.override.yml`.** That is what
production wants (the override sets `RATE_LIMIT_ENABLED=false`), but the same
file is the only place the api's `SEARCH_SERVICE_URL` and
`SEARCH_INTERNAL_SECRET` are wired in development. In production, set both in
the env file — see [Search and discovery](../concepts/search.md).

**`vidra-core/.env` must not exist on a deployment host.** Compose resolves an
included model's `${VAR}` substitutions against the `.env` file in the *included
file's own directory*, so `docker-compose.yml` pins `env_file: /dev/null` on its
`include:` specifically to stop a stray `vidra-core/.env` poisoning them. That
file ships as `.env.example` and vidra-core's own README tells developers to copy
it. If it is ever loaded it points every DSN at `localhost` and substitutes the
dev JWT secret. Keep the host clean and verify after any compose change:

```bash
rm -f vidra-core/.env
./deploy/compose.sh config | grep -E 'DATABASE_URL|REDIS_URL'   # must name postgres/redis
```

## Development shortcuts

```bash
make dev        # backend + search: postgres, redis, migrate, api :8080, search :8081
make up         # the whole stack in containers, frontend on :3000
make dev-hot    # whole stack in Docker with live reload
make ipfs-live  # core stack + live public IPFS mirror + the private mirror
make logs       # tail everything
make down       # stop; volumes preserved
make env-check  # which env template the compose commands would use
make help       # every target
```

`make nuke` and `make dev-hot-nuke` delete data volumes. They prompt, or need
`CONFIRM=1`.
