---
title: Requirements and sizing
description: What a Vidra instance actually needs, and why transcoding sets the floor.
---

# Requirements and sizing

Size the host for **transcoding**, not for web serving. ffmpeg runs inside the
api container, so the box that answers HTTP is the same box that encodes video.

One `TargetAll` job on a 1080p source is **twelve full-source encode passes**:
four HLS ladder rungs, four trick-play I-frame encodes and four progressive web
videos. Expect roughly **1.5–2.5× the source duration** of wall clock on 4 vCPU
at `-preset veryfast`.

## Host sizing

| Launch profile | Host | Why |
|---|---|---|
| Small or private — under 50 users, occasional uploads | **4 vCPU / 8 GB / 160 GB — about $63/month** | The floor. Set `API_CPUS=3.0`, `API_MEM_LIMIT=4g`, `POSTGRES_SHARED_BUFFERS=512MB`, `POSTGRES_EFFECTIVE_CACHE_SIZE=3GB`: the prod overlay's defaults target the 16 GB box, and Docker refuses to start a container whose `cpus` exceeds the host core count. |
| Public launch | **8 vCPU / 16 GB / 160 GB — about $168/month** | The overlay's defaults (`API_CPUS=7.0`, `API_MEM_LIMIT=6g`). Transcoding takes seven cores and still leaves one for the api and Postgres. Roughly halves upload-to-playable time. |
| With ClamAV (`MALWARE_SCAN_ENABLED=true`) | **add 2 GB of RAM** | `clamd` loads the full signature database into memory — about 1.5–2 GiB resident — and OOM-kills on a small host. |

**Do not use a 2 GB droplet.** Production pulls images rather than building
them, so `next build` never runs on the box, but Postgres, api, frontend,
search, Caddy and one transcode still need about 4 GB before ClamAV.

Prices are DigitalOcean Premium droplet list prices as of the sizing work in
`deploy/README.md`; treat them as an order of magnitude, not a quote.

## Swap

A **4 GB swapfile** is the difference between a slow transcode and an OOM-killed
Postgres.

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

`deploy/provision.sh` does this — and the `/etc/fstab` line people forget — along
with the service user, the Docker log cap, `unattended-upgrades` and the backup
timer.

## Transcode scratch

The prod overlay sets `TMPDIR=/scratch`, which redirects every temp-file site at
once, including a full uncompressed PCM wav for Whisper and a full second encode
for VP9. Budget:

> **about 4 × `UPLOAD_MAX_SIZE` × `transcoding_concurrency`**

With the default `UPLOAD_MAX_SIZE=2G` that is roughly **8 GB per concurrent
job**. Mount a separate block-storage volume at the host path backing the
`transcode_tmp` named volume; without one, scratch lands under
`/var/lib/docker` on the same root disk as Postgres.

Raising `transcoding_concurrency` multiplies both CPU **and** scratch disk. Set
`transcoding_threads` to vCPU−1 and leave concurrency at 1. Both are runtime
settings in the admin UI and need no restart.

## Software floors

| Requirement | Version | Why |
|---|---|---|
| Docker Engine | **24 or newer** | — |
| Docker Compose | **2.20 minimum, 2.24 in production** | 2.20 for the top-level `include:` key; 2.24 for the `!reset` / `!override` merge tags that close the database port publishes. Below 2.24 those tags are silently ignored and Postgres, Redis and search stay exposed. |
| Go | **1.26** | Only if you build from source. A normal deployment pulls images. |
| PostgreSQL | **18** | Bundled by the compose stack. |
| Redis | **8** | Bundled by the compose stack. |
| Node.js | **20 or newer**, with npm | Only for host-side frontend development. |
| GNU make and git | — | Only for the source-checkout path. |

## Ports that must verify closed

The real firewall is the loopback discipline in `docker-compose.prod.yml`, not a
host `ufw` — Docker installs its own `DOCKER-USER` iptables chain that is
traversed before ufw's rules, so `ufw deny 5432` has no effect on a container
publishing 5432. Use a cloud firewall outside the host, and then verify from
**another machine**:

```bash
nmap -Pn -p 22,80,443,3000,5432,6379,8080,8081 <host-ip>
```

Only **22, 80 and 443** may be open. If 5432 or 6379 answer, the prod overlay is
not being applied — wrong `-f` chain, or a Compose older than 2.24.

Two more ports are opened only by the profiles that need them, because remote
peers dial them directly and a reverse proxy cannot stand in front of either:

| Port | Open it when | Why it cannot be loopback |
|---|---|---|
| **1935/tcp** | `VIDRA_COMPOSE_PROFILES` contains `media` | RTMP ingest. OBS on a creator's laptop connects from the internet. |
| **4001/tcp+udp** | …contains `ipfs` | libp2p swarm. Peers dial in; a node nobody can reach only ever pushes. |

Both stay closed on an instance that has not enabled those profiles, which is
the default. `deploy/provision.sh` reads the profiles out of your env file and
prints exactly the list your firewall needs.

The full service and port matrix is in [Ports and services](../reference/ports.md).

## Managed Postgres — not at launch

`internal/store/store.go` hardcodes `MaxConns=10` after `ParseConfig`, silently
discarding `pool_max_conns` from the DSN. Core 10 plus search 10 plus a 4-connection
import pool is 24 connections, above the smallest DigitalOcean Managed plan's
cap. Run the bundled Postgres 18 with the nightly dump off-site, and move to
managed once a `DATABASE_MAX_CONNS` knob exists.
