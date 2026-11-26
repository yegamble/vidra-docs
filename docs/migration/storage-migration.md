---
title: Media migration
description: The three media modes, and what each one leaves you with.
---

# Media migration

The importer moves media as part of the import. You do not rsync files into
place and hope the database agrees — you pick a **media mode** and the importer
does the rest.

## The three modes

| Mode | What it does | Requires |
|---|---|---|
| **`copy`** (default) | Streams every source object into **this instance's** storage layout, under Vidra's own keys. | Enough time and bandwidth to move the whole library, and enough space at the destination. |
| **`reference`** | Records the **existing PeerTube object keys** in Vidra's database instead of moving anything. | Vidra's `STORAGE_*` must point at **the same object store** the source uses. |
| **`none`** | Metadata only. Writes no media rows at all. | Nothing. Useful for a structural dry run against a real target. |

```bash
--media-mode=copy        # CLI
PEERTUBE_IMPORT_MEDIA_MODE=copy   # env, for the admin API path
```

### Choosing

**`reference` is the fast path, and it has one hard precondition.** It writes
down keys that already exist in a bucket; if Vidra is not configured against
that same bucket, every one of those rows points at nothing. It is the right
choice when the source's media is already in object storage and you are happy to
keep serving it from there — the migration then moves no bytes at all.

**`copy` is the right choice when you are changing storage anyway** — source on
local disk, destination on S3, or moving between providers. It is bounded by the
size of the library and your link between the two.

**`none` is for rehearsal.** Import the catalogue, look at the shape of it, then
re-run with a real mode. Because the importer is idempotent and ledger-backed,
that re-run backfills onto what the first one created.

The HLS quality ladder's rungs — the `videoFile` rows behind each rendition —
are carried **in reference mode**.

## Where the source media actually is

This is the part that surprises people, and it decides whether the source host
has to be reachable at all.

**PeerTube's `object_storage` covers streaming playlists, web videos, user
exports, originals and captions — full stop.** It never covers:

- account and channel **avatars**
- channel **banners**
- video **posters** (thumbnails and previews)
- **storyboards**

Those four families live on the **source host's local disk** whatever the S3
settings say, so `--source-storage=s3` cannot see them.

The importer handles this itself. It reads them from a mounted
`--source-local-root` when there is one, and otherwise **fetches them over HTTP
from the source instance**, deriving the source's public origin from its own
actors' canonical URLs. It fetches
`/lazy-static/{avatars,thumbnails,storyboards}/<filename>`, four connections at
a time, and **content-sniffs the bytes** before storing anything.

:::caution Why the content sniff is load-bearing
`/static/avatars/<name>` on a PeerTube instance answers **200 with the web app's
HTML** rather than a 404. A fetch that trusted the status code would give every
account a 62 KB HTML "avatar". The importer checks what the bytes actually are.
:::

All four families are carried under `reference` too — there is no object key to
reference, so they are fetched either way. `--media-mode=none` skips them. An
asset the instance already has is **never written over**.

So: either mount the source's media directory as `--source-local-root`, or keep
the source instance HTTP-reachable during the run.

## A migration that moves no bytes off the source host

Worth stating plainly, because it changes what access you need:

> On an instance whose media already lives in S3 or B2, with
> `--source-storage=s3`, **no media transits the source host**. The only thing
> needing reach into it is the database — and PeerTube binds Postgres to
> `127.0.0.1`, so that reach is an SSH tunnel.

Add the four image families above, which do come from the source host, and that
is the whole access footprint.

## Verifying afterwards

Vidra has a built-in check for exactly the question "does the store have
everything the database references":

```bash
# fast: existence only
docker compose … run --rm api verify-blobs --timeout=10m

# thorough: re-download and compare digests, and walk each HLS tree
docker compose … run --rm api verify-blobs --hash --deep --timeout=4h
```

Run the fast pass after the import. Run the `--hash --deep` form once before
cutover if you copied a large library — it is a full read of every original, so
it is a deliberate cost, but it is the only mode that detects media that is
present but corrupt, and `--deep` is what catches a partial copy that brought
back one small manifest per video and none of the segments.

`verify-blobs` never writes. There is no repair mode: every plausible repair
destroys information, and only you know which of the two stores is stale.

:::warning Do not run `verify-blobs` during a storage migration
When the two stores are deliberately out of step, its answer is meaningless.
`vidra doctor`'s **storage migration** check reports that state before you
start.
:::

## Moving storage after the import

If you imported in `reference` mode and later want the media in your own bucket,
that is a **storage migration**, not a re-import. Vidra has a managed path for
it — the admin API at `/api/v1/admin/storage/migrations`, with `/{id}` to poll
and `/{id}/cancel` to stop — which verifies each copy in flight. Drive it from
the admin console.

## Estimating transfer time

`copy` moves the whole library once. `reference` moves nothing. For a `copy` run
across a WAN, the honest planning number is your link's sustained throughput
against the `SUM(size)` you recorded during
[planning](./planning.md#step-1-inventory-the-source) — a terabyte over a
100 Mbit link is a day, not an afternoon.

Because the importer is resumable, a long copy is not a single window you have
to hold open: start it early, re-run it as often as you like, and let the final
pre-cutover run be a small delta.

## Next

- **[Cutover and validation](./cutover.md)**
