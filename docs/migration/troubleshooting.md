---
title: Migration troubleshooting
description: What actually goes wrong during a PeerTube import, and what to do about it.
---

# Migration troubleshooting

## The importer will not start

### `503` from the admin import endpoint

PeerTube import is not configured on this instance. Set
`PEERTUBE_IMPORT_ENABLED=true` and `PEERTUBE_SOURCE_DATABASE_URL` in
`env/production.env`, and redeploy. See
[Planning, step 5](./planning.md#step-5-configure-the-source-in-the-env-file).

```bash
vidra setup --check env/production.env
```

### `409 Conflict` when launching a run

Only one import run may be active at a time. List recent runs and wait for the
active one to reach `done` or `failed`:

```bash
curl -sf https://example.com/api/v1/admin/peertube-import \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.[] | {id, state, mode}'
```

### `error_code: unverified_schema`

Preflight detected a source `migrationVersion` outside the verified range
[700, 1000]. `source_version` in the run tells you what it found. Re-launch with
`acknowledged_schema_version` set to that number, **after** verifying
compatibility — see [the version gate](./overview.md#the-version-gate).

### `error_code: undetectable_schema`

No schema version could be read from the source at all. This one is **not
acknowledgeable**: there is no version to name. It needs a human on the
[command-line importer](./manual-migration.md) with `--force`.

## Connecting to the source database

### It connected to nothing, or to the wrong machine

PostgreSQL drivers fall back to a **local unix socket** when the connection
string carries no usable host, so a typo'd or missing host silently becomes a
path on the machine running the importer. Write the full form:

```
postgres://readonly:PASSWORD@HOST:5432/peertube_prod?sslmode=require
```

If you are tunnelling, name the **local end of the tunnel**:

```bash
ssh -fN -L 5433:localhost:5432 user@peertube-server
# → postgres://readonly:PASSWORD@127.0.0.1:5433/peertube_prod
```

### The database is not reachable at all

PeerTube binds Postgres to `127.0.0.1` by default, and that is the right setting
to leave alone. Tunnel to it rather than opening the port:

```bash
nc -zv 127.0.0.1 5433        # after the tunnel is up
PGPASSWORD=… psql -h 127.0.0.1 -p 5433 -U readonly -d peertube_prod -c 'SELECT 1;'
```

### Nothing on the Vidra host can reach `postgres:5432`

Different problem, same shape. The production overlay publishes **no** Postgres
port at all, and the service name resolves only inside the compose network — so
a host-side tool with a `DATABASE_URL` copied from the env file fails with a DNS
error rather than anything about ports. Run the tool inside the network:

```bash
docker run --rm --network vidra_default --env-file env/production.env <image> …
```

## Counts do not match

Before treating a difference as a bug, check it is not one of these.

**Deliberately not carried:** moderation state (video blacklist, account and
server blocklists, abuse reports), user notification settings, watch history.

**Not carried, just unread:** `videoSource` — original-file provenance records.

**Counted differently in the dry run:**

- `view_count` counts **videos** whose total would be carried, never views.
- `video_original_date` counts **videos** carrying an `originallyPublishedAt`,
  and is 0 for a source too old to have that column.
- `category_taxonomy` is one setting, so it is 0 or 1.
- `storyboard` is legitimately lower than the video count — PeerTube generates
  none for a video shorter than three seconds.

**Skipped by the conflict policy.** The default `skip` leaves an existing Vidra
row alone when a source row collides on username, handle, email or slug. The run
reports those under `conflicts`. Choose `rename`, `merge` or `fail` deliberately
if `skip` is not what you want.

**Remote videos.** A federated instance's `video` table contains videos that were
never local to it. Compare against `WHERE remote = false`.

## Every card shows a broken image

Re-run the importer. A release before the poster pass recorded each poster as an
object key in the source's bucket — which PeerTube never writes — so
`has_thumbnail` said true and every thumbnail 404'd. The poster pass repairs
those rows **in place** and backfills storyboards onto the same catalogue.
Nothing needs re-importing from scratch.

## Avatars, banners, posters or storyboards are missing

These four families never live in PeerTube's object storage, whatever its S3
settings say. They come from the source host's local disk. Either:

- mount that directory and pass `--source-local-root`, or
- keep the source instance **HTTP-reachable** during the run, so the importer can
  fetch `/lazy-static/{avatars,thumbnails,storyboards}/<filename>` from it.

`--media-mode=none` skips them entirely. See
[Media migration](./storage-migration.md#where-the-source-media-actually-is).

## Videos do not play

Work from the database outwards.

```bash
# 1. Does the store have what the database references?
docker compose … run --rm api verify-blobs --timeout=10m

# 2. And are the bytes actually right? (full read; deliberate cost)
docker compose … run --rm api verify-blobs --hash --deep --timeout=4h

# 3. Is the storage backend even healthy?
vidra doctor
vidra doctor --write-probe     # after changing storage credentials
```

**If you imported with `--media-mode=reference`**, Vidra's `STORAGE_*` must point
at **the same object store** the source uses. Referencing keys in a bucket the
server is not configured against leaves every row pointing at nothing.

Do not try to fix this by copying files into a path you guessed. Media keys are
relative and backend-opaque by design; the database does not describe a
filesystem layout you can reproduce by hand. Re-run the importer with
`--media-mode=copy`, or run a
[storage migration](../install/storage-backends.md#moving-between-backends).

## Videos are there but categories are blank

The source is probably running `peertube-plugin-categories`, which deletes the
stock 1–18 list and defines its own at higher ids. The importer carries that
taxonomy into an instance setting that replaces the built-in list — but it
**never clobbers an operator's own taxonomy**. If you had already configured
categories by hand, the import leaves yours in place and reports the divergence
under `conflicts`.

Clear the setting and re-run the import if you want the source's taxonomy to
win.

## Users cannot sign in

Check the obvious thing first: **passwords do come across**. The importer carries
the source's bcrypt hash verbatim and Vidra verifies against it, so a user
signing in with their existing password should work. If it does not:

- Confirm the account actually imported (`skip` may have left an existing Vidra
  row with that username in place).
- Confirm the instance is claimed. An unclaimed instance answers
  `403 owner_claim_required` on **every** signup path, and that includes anything
  the import would create. See [Quickstart](../start/quickstart.md).
- If the password was changed on the source *after* your last run, only a
  `source_authoritative` run carries the new hash.

## The run is slow

Add indexes on the **source** if it lacks them, and run during off-peak hours.
More usefully: the importer is idempotent and resumable, so a long run does not
have to be a single window. Start early, re-run as often as you like, and let the
final pre-cutover pass be a small delta.

## After a large import, Vidra feels slow

Refresh the planner's statistics:

```sql
ANALYZE;
```

## The database password ended up in `ps`

`--source-dsn` has no `@path` or stdin indirection, so it lands in `argv` where
any local user can read it. That is a known gap. Prefer the
[admin API path](./api-migration.md), whose source connection lives in server
config and is never sent by a browser — and if you must use the CLI, run it on a
host where that exposure is acceptable and rotate the read-only role afterwards.

## Getting help

File an issue at
[github.com/yegamble/vidra-core/issues](https://github.com/yegamble/vidra-core/issues)
with:

- the source `migrationVersion` (`SELECT "migrationVersion" FROM application;`)
- the Vidra release (`curl -s http://127.0.0.1:8080/version`)
- the path used — admin API or CLI — and the mode, conflict policy and media
  mode
- the run's `error_code`, `error` and `report`
- approximate instance size

Never paste a DSN or a credential into an issue. The run object's `error` field
is deliberately safe to share; the DSN is not.
