---
title: Ports and services
description: Every published port, in development and in production.
---

# Ports and services

Two different answers, depending on which compose chain is applied. In
development the ports are published for convenience; in production
`docker-compose.prod.yml` resets almost all of them, and that reset **is** the
firewall.

## Development

`docker-compose.yml` plus `vidra-core/docker-compose.yml`, no production overlay.

| Service | Port | Env override | Profile |
|---|---|---|---|
| api | 8080 | `HTTP_PORT` | `core` |
| frontend | 3000 | `FRONTEND_PORT` | `frontend` |
| search | 8081 | `SEARCH_HTTP_PORT` | `core` |
| postgres | 5432 | `POSTGRES_PORT` | `core` |
| redis | 6379 | `REDIS_PORT` | `core` |
| minio | 9000 | `MINIO_PORT` | `storage` |
| clamav | 3310 | `CLAMAV_PORT` | `scan` |
| whisper | 8090 | `WHISPER_PORT` | `captions` |
| rtmp | 1935 | `RTMP_PORT` | `media` |
| otel-collector | 4317 (gRPC), 4318 (HTTP) | `OTEL_GRPC_PORT`, `OTEL_HTTP_PORT` | `otel` |
| jaeger UI | 16686 | `JAEGER_UI_PORT` | `otel` |
| ipfs swarm | 4001 TCP and UDP | `IPFS_SWARM_PORT` | `ipfs`, `full` |
| ipfs API | 5001, **loopback only** | `IPFS_API_PORT` | `ipfs`, `full` |
| ipfs gateway | 9090, **loopback only** | `IPFS_GATEWAY_PORT` | `ipfs`, `full` |
| kubo-private API | 5002, **loopback only** | `IPFS_PRIVATE_API_PORT` | `ipfs-private` |
| ipfs-cluster-private API | 9094, **loopback only** | `IPFS_PRIVATE_CLUSTER_API_PORT` | `ipfs-private-cluster` |

## Production

With `docker-compose.prod.yml` applied:

| Reachable from | Ports |
|---|---|
| **The internet** | 80 and 443 (caddy) — plus 1935 with the `media` profile and 4001 TCP+UDP with the `ipfs` profile |
| **Loopback on the host** | 8080 (api), 3000 (frontend), and the IPFS RPC and gateway ports |
| **Nothing at all** | postgres, redis, search, minio, clamav, whisper, otel, jaeger |

The overlay uses the `!reset` / `!override` merge tags to remove the base
files' publishes. Compose *merges* sequence fields across a `-f` chain, so a
plain `ports: []` in an overlay appends nothing and the base file's
`0.0.0.0:5432` publish survives — `!reset` is what actually closes the port.

:::danger Below Compose 2.24 the tags are silently ignored
Postgres, Redis and the search service stay exposed to the internet, and the
deploy reports success. `deploy.sh`, `rollback.sh` and `restore.sh` each parse
`docker compose version --short` and refuse below 2.24 for exactly this reason.
Verify with `nmap` rather than trusting a version string.
:::

## The two ports that cannot be loopback

The overlay deliberately does not reset these, because remote peers dial them
directly and a reverse proxy cannot stand in front of either.

| Port | Open it when | Why |
|---|---|---|
| **1935/tcp** | `VIDRA_COMPOSE_PROFILES` contains `media` | RTMP ingest. OBS on a creator's laptop connects from the internet. |
| **4001/tcp+udp** | …contains `ipfs` | libp2p swarm. Peers dial in; a node nobody can reach only ever pushes. |

Both stay closed on an instance that has not enabled those profiles, which is the
default. `deploy/provision.sh` reads the profiles out of your env file and prints
exactly the list your firewall needs, so re-run it after changing them.

meta-ci renders the overlay with *every* optional profile enabled and fails if
anything other than caddy 80/443, rtmp 1935 and ipfs 4001 faces the network.
That allow-list is the contract; a new service wanting a host port has to argue
for it there first.

## Verify, from another machine

```bash
nmap -Pn -p 22,80,443,3000,5432,6379,8080,8081 <host-ip>
```

Only 22, 80 and 443 may be open. If 5432 or 6379 answer, the prod overlay is not
being applied — wrong `-f` chain, or a Compose older than 2.24.

:::warning A host `ufw` does not filter Docker-published ports
Docker installs its own `DOCKER-USER` iptables chain, traversed **before** ufw's
rules, so `ufw deny 5432` has no effect on a container publishing 5432. Use a
firewall that sits outside the host — a cloud firewall — and treat the loopback
binds in `docker-compose.prod.yml` as the real control. Running ufw for
non-Docker services is fine; do not believe it is protecting the stack.
:::

## Edge path routing

Caddy is the only internet-facing service and splits one origin by path:

| Path | Goes to |
|---|---|
| `/api/*`, `/healthz`, `/readyz`, `/version`, `/sitemap.xml`, `/feeds/*`, `/nodeinfo/*`, `/.well-known/*` | api on `127.0.0.1:${HTTP_PORT}` |
| everything else | frontend on `127.0.0.1:${FRONTEND_PORT}` |
| `/metrics` | **404, unconditionally** — the route is unauthenticated and must be scraped from inside the network |
| `/api/v1/dev/*` | **404** at the edge |

`/schemaz` is deliberately not on the allow-list: it is host-local only.

Nothing is `encode`d on the api routes — edge compression on already-compressed
media buys nothing and breaks Range requests, which is how seeking works.
