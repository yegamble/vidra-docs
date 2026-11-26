---
title: Command-line importer
description: Building and running peertube-import, with every flag.
---

# Command-line importer

`peertube-import` is the same importer as the
[admin API path](./api-migration.md), driven from a terminal. Reach for it when
the API cannot do what you need:

- the source schema version is **undetectable** and needs `--force`;
- the api cannot reach the source database, but your laptop can, over a tunnel;
- you want the source connection on the command line rather than in server
  config.

## Build it — it ships nowhere

`Dockerfile` builds only `./cmd/api`, and the release assets carry only the
`vidra` CLI. There is no supported way to obtain the importer as a binary.

```bash
git clone https://github.com/yegamble/vidra-core.git
cd vidra-core
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o peertube-import ./cmd/peertube-import
scp peertube-import root@<host>:/opt/vidra/
```

The **target** is read from the ordinary server configuration —
`config.Load()`, so `DATABASE_URL`, `STORAGE_*` and `FEDERATION_KEY_KEK` — which
means the importer runs wherever the Vidra config lives, usually the new host.
The **source** comes from the flags below.

## Flags

### Source database

| Flag | Default | What |
|---|---|---|
| `--source-dsn` | — | **Required.** Read-only DSN of the source PeerTube PostgreSQL. |

:::warning `--source-dsn` has no secret indirection
Every other secret-bearing entry point in this project accepts `@path`, `-` for
stdin, or an environment variable. This one does not, so a production database
password lands in `argv` where any local user can read it from `ps`. Treat that
as a gap to close, and in the meantime run the import on a host where that
exposure is acceptable. The [admin API path](./api-migration.md) has no such
problem — its source connection lives in server config.
:::

:::caution A missing host silently becomes a local unix socket
PostgreSQL drivers fall back to a local socket when the connection string
carries no usable host, so a typo'd or missing host becomes a path on *this*
machine. Write `postgres://user:password@host:port/database` naming the source;
if you are tunnelling, name the local end of the tunnel
(`127.0.0.1:<local port>`).
:::

### Source media

| Flag | Default | What |
|---|---|---|
| `--source-storage` | `local` | `local` or `s3`. |
| `--source-local-root` | — | The source media directory, read-only. For `--source-storage=local`. |
| `--source-s3-endpoint` | — | Host[:port], **no scheme**. |
| `--source-s3-bucket` | — | |
| `--source-s3-access-key` | — | Or `PEERTUBE_SOURCE_S3_ACCESS_KEY`. |
| `--source-s3-secret-key` | — | Or `PEERTUBE_SOURCE_S3_SECRET_KEY`. |
| `--source-s3-region` | — | |
| `--source-s3-use-ssl` | `true` | |
| `--source-s3-force-path-style` | `false` | Set for MinIO. |

### Behaviour

| Flag | Default | What |
|---|---|---|
| `--dry-run` | off | Report the plan and conflicts, and write **nothing**. |
| `--media-mode` | `copy` | `copy`, `reference` or `none`. See [Media migration](./storage-migration.md). |
| `--no-media` | — | Deprecated alias for `--media-mode=none`. |
| `--conflict-policy` | `skip` | `skip`, `rename`, `merge` or `fail`. |
| `--source-authoritative` | off | Let a re-run **update** rows the import already owns. |
| `--resume` | — | Continue a prior import. The default behaviour already skips already-imported rows. |
| `--force` | off | Override the supported-version refusal. **Human operators only.** |

## Run it

Always dry-run first. On a source whose media is already in object storage,
**no media transits the source host at all** — the only thing needing reach into
it is the database, and an SSH tunnel is enough.

```bash
# Tunnel to the source database (PeerTube binds Postgres to 127.0.0.1).
ssh -fN -L 5433:localhost:5432 user@peertube-server

# 1. Dry run — writes nothing, and sends no HTTP request to the source.
./peertube-import \
  --source-dsn 'postgres://readonly:PASSWORD@127.0.0.1:5433/peertube_prod?sslmode=require' \
  --source-storage s3 \
  --source-s3-endpoint s3.us-east-1.amazonaws.com \
  --source-s3-bucket peertube-videos \
  --source-s3-region us-east-1 \
  --dry-run

# 2. The real run.
./peertube-import \
  --source-dsn 'postgres://readonly:PASSWORD@127.0.0.1:5433/peertube_prod?sslmode=require' \
  --source-storage s3 \
  --source-s3-endpoint s3.us-east-1.amazonaws.com \
  --source-s3-bucket peertube-videos \
  --source-s3-region us-east-1 \
  --media-mode reference
```

Compare the dry run's counts against your
[inventory](./planning.md#step-1-inventory-the-source) before running it for
real.

## The version gate, and `--force`

`ClassifyVersion` accepts a source `migrationVersion` in **[700, 1000]** and
refuses anything outside it:

```
source schema version 1040 is newer than the verified range [700, 1000]
— pass --force only after verifying compatibility
```

The flag's own help says *"HUMAN operators only; agents MUST NOT set this"*, and
that is the right boundary: the refusal is a statement about what has been
**verified**, not about what happens to work.

Given the importer only reads, "verifying compatibility" can reasonably mean two
checks:

1. **Every column it references still exists.** Extract the quoted identifiers
   from the importer's SQL and diff them against `information_schema.columns` on
   the source. A removed or renamed column is the failure that would break the
   run loudly. On a 1040 source this came back clean.
2. **What the newer schema added that the importer does not read.** This is the
   quieter risk and the one worth the time: the import does not fail, it
   silently carries less than you assume.

Neither proves semantic equivalence — a column that still exists but now means
something else passes both.

## Passwords come across

The importer carries the source's **bcrypt hash verbatim**, and Vidra verifies
against it. Your users sign in with the passwords they already have; there is no
bulk reset to send. Neither the hash nor any plaintext appears in the importer's
logs — there is a test that asserts it.

## The image families are the odd ones out

Avatars, banners, **video posters and storyboards** are read from a mounted
`--source-local-root` when there is one, and otherwise **fetched over HTTP from
the source instance** — never from its object store. No PeerTube configuration
puts them there: `object_storage` covers streaming playlists, web videos, user
exports, originals and captions, full stop. So they live on the source host's
local disk whatever the S3 settings say, and `--source-storage=s3` cannot see
them.

The importer derives the source's public origin from its own actors' canonical
URLs — there is no extra flag — and fetches
`/lazy-static/{avatars,thumbnails,storyboards}/<filename>`, four connections at a
time, with the bytes **content-sniffed** before anything is stored. That last
part is not belt-and-braces: `/static/avatars/<name>` answers **200 with the web
app's HTML** rather than a 404, and a fetch trusting the status code would give
every account a 62 KB HTML "avatar".

All four are carried under `--media-mode=reference` too, because there is no
object key to reference. `--media-mode=none` skips them. An asset the instance
already has is never written over.

## Re-running

Every pass is keyed by its own ledger rows and runs after its parents, which is
what lets a re-run **backfill onto entities an earlier release already
imported**. An instance whose catalogue is already in Vidra gets newly carried
data by re-running the importer; nothing has to be re-imported from scratch.

> **If your migrated instance shows a broken image on every card, re-run the
> importer.** A release before the poster pass recorded each poster as an object
> key in the source's bucket, which PeerTube never writes — so `has_thumbnail`
> said true and every thumbnail 404'd. The poster pass repairs those rows in
> place and backfills storyboards onto the same catalogue.

## What it does not carry

Deliberately: moderation state (video blacklist, account and server blocklists,
abuse reports), user notification settings, and watch history.

Not deliberately, just unread: `videoSource` — original-file provenance records.

The full table is in [the overview](./overview.md#what-it-carries).

## Next

- **[Media migration](./storage-migration.md)**
- **[Cutover and validation](./cutover.md)**
