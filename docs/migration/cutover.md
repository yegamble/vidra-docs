---
title: Cutover and validation
description: The final sync, the checks that matter, and the rollback that always works.
---

# Cutover and validation

The migration is reversible right up to the moment you move DNS, because the
importer only ever reads PeerTube. Keep the source running; it is your rollback.

## Pre-cutover checklist

- [ ] The most recent import run finished `done`, with its `report` reviewed and
      `conflicts` understood
- [ ] Entity counts reconcile against your
      [inventory](./planning.md#step-1-inventory-the-source)
- [ ] `verify-blobs` is clean — see [Media migration](./storage-migration.md#verifying-afterwards)
- [ ] At least five videos play end to end, at more than one quality
- [ ] Thumbnails, avatars, banners and captions all load
- [ ] PeerTube's database and media are backed up, and the backup is verified
- [ ] Vidra's own backup has run at least once (`./deploy/backup.sh`) and
      `vidra doctor` reports it fresh
- [ ] DNS TTL lowered to 60 seconds, at least 24 hours ago
- [ ] `vidra doctor` is clean, or every warning is understood

## Step 1: freeze the source

Stop new content arriving during the final sync. PeerTube's own maintenance mode
if your version has one; otherwise block writes at its reverse proxy:

```nginx
location /api/ {
    if ($request_method !~ ^(GET|HEAD)$) {
        return 503 "Instance is migrating. Read-only mode.";
    }
    proxy_pass http://peertube:9000;
}
```

## Step 2: final import run

Because the importer is idempotent and ledger-backed, this run is a delta: new
rows are inserted, view totals are applied as a difference, and already imported
rows are skipped.

```bash
curl -sf -X POST https://example.com/api/v1/admin/peertube-import \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"run","source_authoritative":true}'
```

`source_authoritative: true` is what makes **edits** on the source follow —
retitles, changed passwords, moved chapters. Without it the run only fills gaps.

Poll it to `done` before continuing.

## Step 3: validate, before you touch DNS

```bash
# Liveness and readiness
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz

# Schema — dirty must be false
curl -s http://127.0.0.1:8080/schemaz | jq '.schema'

# The whole deployment
vidra doctor
vidra status

# Admin snapshot: six-component dependency health
curl -sf https://example.com/api/v1/admin/system \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'

# Media the database references is actually in the store
docker compose … run --rm api verify-blobs --timeout=10m
```

Then click through the real thing: sign in as a migrated user with their
**existing password** (the bcrypt hash came across), open a video, seek in it,
switch quality, load a channel page, open a playlist, read a comment thread.

If federation is enabled, check the surfaces too:

```bash
curl -s "https://example.com/.well-known/webfinger?resource=acct:someone@example.com"
curl -s https://example.com/.well-known/nodeinfo
curl -s https://example.com/feeds/videos.xml | head -5
```

Those routes exist only when `FEDERATION_ENABLED=true`; on an instance with
federation off they 404, and that is correct rather than broken.

## Step 4: switch DNS

Point the A and AAAA records at the Vidra host, or repoint your reverse proxy's
upstream. With `VIDRA_TLS_MODE=acme` and Caddy in front, `deploy.sh` will have
already refused to deploy if the domain did not resolve to this host — so if you
are changing the domain now, run a deploy after the DNS change so the
certificate is issued for the name that is actually in use.

If your own proxy terminates TLS (`VIDRA_TLS_MODE=external`), you own the
routing split. Forward `/api/*`, `/healthz`, `/readyz`, `/version`,
`/sitemap.xml`, `/feeds/*`, `/nodeinfo/*` and `/.well-known/*` to the api on
`127.0.0.1:8080`, and everything else to the frontend on `127.0.0.1:3000`.
`vidra setup` writes `deploy/nginx-external.conf.example` mirroring the
Caddyfile's split exactly — start from it. A hand-written proxy that sends
`/feeds/*` to the frontend 404s every feed link and nothing errors.

Also forward `X-Forwarded-Proto: https`. Without it the api believes it is
serving plain HTTP and mints `http://` links.

## Step 5: verify through the public domain

```bash
DOMAIN=example.com

curl -fsS "https://$DOMAIN/healthz"
curl -fsS "https://$DOMAIN/readyz"
curl -sI  "https://$DOMAIN/"                      # certificate + frontend
curl -s   "https://$DOMAIN/feeds/videos.xml" | head -5
curl -s   "https://$DOMAIN/sitemap.xml" | head -5

# And from a machine that is not the host: nothing else may be open.
nmap -Pn -p 22,80,443,3000,5432,6379,8080,8081 <host-ip>
```

## Post-cutover checklist

**Accounts** — sign-in works with existing passwords · profile pages load with
avatars · a user can change their own details.

**Content** — video pages carry the right metadata · playback works · quality
switching works · thumbnails, storyboards and captions load · comments appear
with their threading intact.

**Channels and playlists** — channel pages and their video listings ·
subscriptions intact · playlists in the right order, with privacy respected.

**Federation**, if enabled — WebFinger returns the right actor URIs · NodeInfo
reports the right software · a remote instance can follow a channel.

**Admin** — the console loads · user management works · the instance settings
page renders · the job queue is moving.

## Monitoring the first 48 hours

```bash
./deploy/compose.sh logs -f api | grep -i error
vidra doctor                       # run it daily for the first week
curl -fsS https://example.com/healthz
```

Scrape `/metrics` from **inside** the compose network — the edge 404s it
deliberately, because the route is unauthenticated. See
[Monitoring and health](../operate/monitoring.md).

The failure that most often shows up late is **row with no object**: media
deleted on the source after your last media pass, or a bucket restored from a
different point in time. Nothing detects it on its own — the api just 404s that
one video, forever, and you hear about it from a viewer. `verify-blobs` is the
check that finds it.

## Rollback

**The source is your rollback, and it is intact.** The importer only reads it.

```bash
# Repoint DNS, or revert the proxy upstream
# proxy_pass http://peertube-server:9000;
systemctl reload nginx
```

That is the whole procedure. There is nothing to undo on the PeerTube side
because nothing was done to it.

If you need to start the Vidra side over — a bad conflict policy, an import you
want to redo from scratch — restore Vidra's own pre-import dump rather than
deleting rows by hand:

```bash
./deploy/restore.sh backups/<pre-import>.dump.gz
```

### Roll back if

- playback is broken for a large share of the catalogue;
- authentication is non-functional;
- data is missing that the source has and the dry run said would come across.

### Do not roll back for

- entity counts that differ by the things the importer **deliberately does not
  carry** — moderation state, notification settings, watch history — see
  [what it carries](./overview.md#what-it-carries);
- ActivityPub followers needing to re-follow: that is expected;
- PeerTube plugins not working: Vidra has no plugin system that could run them;
- an API shape that differs from PeerTube's: Vidra is not API-compatible, by
  design.

## After a successful migration

1. **Tell your users** what changed — and that their passwords still work.
2. **Raise the DNS TTL** back to normal.
3. **Keep PeerTube's backups for at least 30 days** before decommissioning it.
4. **Prove Vidra's backup and restore path** on a scratch stack, if you have not
   already.
5. **Re-run the importer** once more if a later release learns to carry
   something you want — it backfills onto the catalogue you already have.
6. **Notify federation peers** of the change, if you federate.
