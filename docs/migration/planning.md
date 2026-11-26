---
title: Planning your migration
description: Inventory the source, reach its database, and prepare the Vidra instance.
---

# Planning your migration

Three things decide how hard a migration is: what is in the source, how you
reach it, and where the media lives. Work all three out before you start.

## Step 1: inventory the source

Connect to your PeerTube PostgreSQL database and run these. Record the numbers —
they are what you compare the dry run against.

```sql
-- Users and accounts
SELECT COUNT(*) AS users FROM "user";
SELECT COUNT(*) AS accounts FROM account;

-- Channels
SELECT COUNT(*) AS channels FROM "videoChannel";

-- Videos by state, local only
SELECT state, COUNT(*) FROM video WHERE remote = false GROUP BY state;

-- Total video storage
SELECT pg_size_pretty(SUM(size)) AS total_size, COUNT(*) AS file_count
FROM "videoFile";

-- HLS streaming playlists
SELECT COUNT(*) AS hls_playlists FROM "videoStreamingPlaylist";

-- Comments
SELECT COUNT(*) AS comments FROM "videoComment" WHERE "deletedAt" IS NULL;

-- Playlists
SELECT COUNT(*) AS playlists FROM "videoPlaylist";
SELECT COUNT(*) AS playlist_items FROM "videoPlaylistElement";

-- Captions
SELECT COUNT(*) AS captions FROM "videoCaption";

-- Subscriptions (channel follows)
SELECT COUNT(*) AS subscriptions FROM "actorFollow"
  WHERE "actorFollow"."targetActorId" IN (
    SELECT a.id FROM actor a WHERE a."videoChannelId" IS NOT NULL
  );

-- Chapters, ratings, and the assets that come across as their own passes
SELECT COUNT(*) AS chapters FROM "videoChapter";
SELECT COUNT(*) AS ratings FROM "accountVideoRate";
SELECT COUNT(*) AS actor_images FROM "actorImage";
SELECT COUNT(*) AS storyboards FROM storyboard;
```

**Check the schema version first** — it decides whether the importer will run at
all:

```sql
SELECT "migrationVersion" FROM application;
```

The verified range is **[700, 1000]**. Outside it the run refuses, and
overriding that is a human decision — see
[the version gate](./overview.md#the-version-gate).

:::note `storyboard` is legitimately lower than the video count
PeerTube generates none for a video shorter than three seconds. Do not read that
gap as a missing import.
:::

## Step 2: work out how you reach the database

**The importer reads the source PostgreSQL directly.** It is not an API client,
and it needs no application-level access to the source at all.

PeerTube binds Postgres to `127.0.0.1`, so that reach is normally an SSH tunnel —
and a tunnel is all the access the migration requires:

```bash
ssh -L 5433:localhost:5432 user@peertube-server
# then point the importer at 127.0.0.1:5433
```

Create a **read-only** role on the source and use it. The importer only reads.

## Step 3: assess the media

Where PeerTube keeps media decides which media mode you want, and this is the
part that surprises people.

```bash
# Default PeerTube storage paths
du -sh /var/www/peertube/storage/videos/
du -sh /var/www/peertube/storage/streaming-playlists/
du -sh /var/www/peertube/storage/thumbnails/
du -sh /var/www/peertube/storage/previews/
du -sh /var/www/peertube/storage/avatars/
du -sh /var/www/peertube/storage/captions/
```

If PeerTube uses object storage, note the buckets and credentials from its
`production.yaml`:

```yaml
object_storage:
  enabled: true
  endpoint: 's3.us-east-1.amazonaws.com'
  region: 'us-east-1'
  credentials:
    access_key_id: '...'
    secret_access_key: '...'
  videos:
    bucket_name: 'peertube-videos'
  streaming_playlists:
    bucket_name: 'peertube-streaming'
```

:::caution `object_storage` never covers avatars, posters or storyboards
PeerTube's `object_storage` covers streaming playlists, web videos, user
exports, originals and captions — full stop. Avatars, banners, video posters and
storyboards live on the **source host's local disk** whatever the S3 settings
say, so `--source-storage=s3` cannot see them.

The importer handles this: it reads them from a mounted `--source-local-root`
when there is one, and otherwise fetches them over HTTP from the source
instance's public origin, which it derives from its own actors' canonical URLs.
Either way, plan for the source host to be reachable for those four families, or
mount its media directory.
:::

The mode choice is in [Media migration](./storage-migration.md).

## Step 4: prepare the Vidra instance

Your Vidra instance must be fully set up and **claimed** before you import.

```bash
# 1. Installed and deployed
cd /opt/vidra && vidra deploy

# 2. Ready
curl -fsS http://127.0.0.1:8080/readyz

# 3. Owner account claimed — see the Quickstart. An unclaimed instance refuses
#    every signup path, which includes anything the import would create.

# 4. Schema at HEAD, and clean
curl -s http://127.0.0.1:8080/schemaz | jq '.schema'   # dirty must be false

# 5. The deployment is healthy
vidra doctor
```

Configure the storage backend you actually want **before** importing — moving
media afterwards is a second migration. See
[Storage backends](../install/storage-backends.md).

## Step 5: configure the source in the env file

The API path takes its source connection from **server config only**; the
browser never sends a DSN. Set it with `vidra setup --peertube`, or directly in
`env/production.env`:

```bash
PEERTUBE_IMPORT_ENABLED=true
PEERTUBE_SOURCE_DATABASE_URL=postgres://readonly:PASSWORD@127.0.0.1:5433/peertube_prod?sslmode=require
PEERTUBE_SOURCE_STORAGE_BACKEND=local          # or s3
PEERTUBE_SOURCE_STORAGE_LOCAL_ROOT=/mnt/peertube-storage
# when the source is on S3:
PEERTUBE_SOURCE_S3_ENDPOINT=s3.us-east-1.amazonaws.com   # host only, no scheme
PEERTUBE_SOURCE_S3_BUCKET=peertube-videos
PEERTUBE_SOURCE_S3_ACCESS_KEY=…
PEERTUBE_SOURCE_S3_SECRET_KEY=…
PEERTUBE_SOURCE_S3_REGION=us-east-1
PEERTUBE_IMPORT_CONFLICT_POLICY=skip           # skip | rename | merge | fail
PEERTUBE_IMPORT_MEDIA_MODE=copy                # copy | reference | none
```

`vidra setup --peertube` shape-checks these with the api's own validators and
only ever writes them down — at setup time the stack does not exist, so nothing
dials the source. `--peertube=false` closes the import surface again.

`--peertube-source-url` and `--peertube-source-s3-secret-key` accept `@path`,
stdin or a `VIDRA_SETUP_*` variable, so the DSN need never appear in your shell
history. A connection string is a secret: it carries the password inside it.

Without `PEERTUBE_IMPORT_ENABLED=true` and a source DSN, the admin import
endpoint answers **503**.

## Step 6: plan the rollback

1. **Back up PeerTube completely**, and verify the backup:
   ```bash
   pg_dump -Fc -d peertube_prod -f peertube-backup-$(date +%Y%m%d).dump
   tar czf peertube-storage-$(date +%Y%m%d).tar.gz /var/www/peertube/storage/
   ```
2. **Document your current DNS and proxy configuration** so you can revert
   quickly.
3. **Keep PeerTube running** until the migration is validated. The importer only
   reads it; there is no reason to take it down early.
4. **Set a go/no-go deadline.**

## Pre-migration checklist

- [ ] Source `migrationVersion` read, and inside [700, 1000] — or the override
      decision consciously taken
- [ ] Source inventory recorded
- [ ] Read-only database role created, and reachable (directly or over a tunnel)
- [ ] Media location known, and the media mode chosen
- [ ] Source host reachable, or its media directory mounted, for avatars,
      banners, posters and storyboards
- [ ] Vidra deployed, `/readyz` green, schema clean, owner claimed
- [ ] Vidra storage backend configured and write-tested
      (`vidra doctor --write-probe`)
- [ ] `PEERTUBE_*` source configuration written and validated
- [ ] PeerTube database and media backed up
- [ ] DNS and proxy rollback plan documented
- [ ] Maintenance window communicated, go/no-go deadline agreed

## Next

- **[Admin API import](./api-migration.md)** — the managed path.
- **[Command-line importer](./manual-migration.md)** — for anything the API
  cannot do.
