---
title: Storage backends
description: Configuring local, S3-compatible and IPFS storage, and backing each one up.
---

# Storage backends

The concepts are in [Storage and media](../concepts/storage-and-media.md). This
page is the configuration.

## Choose the authoritative store

Exactly one of these is authoritative. Everything else is a mirror.

### `STORAGE_BACKEND=local`

Media lives in the `media_data` Docker volume.

:::danger `local` needs the `media_data` volume from the prod overlay
Without it the default root resolves to `/app/data/media` on the container's
writable layer, and `up -d` destroys the media while the Postgres rows survive,
pointing at nothing.
:::

Nothing backs that volume up. `backup.sh` dumps the database and archives the
config, and never touches a byte of media — see the snapshot procedure below.

### `STORAGE_BACKEND=s3`

The production default. Anything S3-compatible: DigitalOcean Spaces, Backblaze
B2, AWS S3, MinIO.

```bash
STORAGE_BACKEND=s3
STORAGE_S3_ENDPOINT=nyc3.digitaloceanspaces.com   # HOST ONLY — a :// is rejected
STORAGE_S3_REGION=nyc3
STORAGE_S3_ACCESS_KEY=…
STORAGE_S3_SECRET_KEY=…
STORAGE_S3_BUCKET=…
STORAGE_S3_USE_SSL=true            # already the right compose default
STORAGE_S3_FORCE_PATH_STYLE=false  # true for MinIO
```

Pre-create the bucket. Rotating the access keys is free: create the new key,
deploy, then delete the old one — not the other way round.

**Durability is a bucket setting.** Pick one of two stories and know which you
picked:

| | Protects against | Costs |
|---|---|---|
| **Versioning** | A delete or an overwrite — yours, or a compromised key's | Every superseded version bills **until a lifecycle rule removes it** |
| **Cross-region replication** | Losing the region, the bucket, or account access | A second copy's storage and egress, continuously |

If you turn versioning on, pair it with a lifecycle rule that expires
non-current versions — thirty days is a sane default. Without one, a versioned
bucket never reclaims anything, and a *successful* media-GC sweep frees exactly
zero bytes while reporting thousands of deletions. This matters most on
**Backblaze B2, whose buckets are versioned by default**. `vidra doctor` reports
it under **object retention**. Preserve every S3 version used by an active
[IPFS reference pin](#versioned-s3-reference-pins) when setting expiry rules.

### Transcode scratch

```bash
# The prod overlay sets TMPDIR=/scratch, backed by the transcode_tmp volume.
# Budget ~4 × UPLOAD_MAX_SIZE × transcoding_concurrency — about 8 GB per
# concurrent job at the default UPLOAD_MAX_SIZE=2G.
```

Mount a separate block-storage volume at the host path behind `transcode_tmp`.
Without one, scratch lands under `/var/lib/docker` on the same root disk as
Postgres.

## IPFS mirroring

Two independent tiers, each behind its own profile.

```bash
# public tier
VIDRA_COMPOSE_PROFILES="core frontend ipfs"
IPFS_ENABLED=true
IPFS_PUBLIC_GATEWAY_URL=https://your-gateway.example   # defaults to https://ipfs.io

# private tier
VIDRA_COMPOSE_PROFILES="core frontend ipfs-private"
IPFS_MIRROR_PRIVATE=true
```

Locally, `make ipfs-live` brings up the public mirror on a live Kubo node
alongside the swarm-keyed private one.

Kubo's RPC ports stay loopback-only. **Port 4001, TCP and UDP, must be open in
your firewall** when the `ipfs` profile is on: it is the libp2p swarm, peers dial
in, and a node nobody can reach only ever pushes.

The admin endpoint for these Compose mirrors is `GET /api/v1/ipfs/status`.
It answers `503 ipfs_disabled` when both `IPFS_ENABLED` and `IPFS_MIRROR_PRIVATE` are
false.

:::danger A public CID can outlive your node
A public CID may remain retrievable after the local node unpins it. That is an
intentional disclosure boundary. Do not put anything on the public tier that you
might later need to make unavailable — that is what the private tier is for.
:::

### Versioned S3 reference pins

The deployment repository provides an opt-in operator CLI for a dedicated Kubo
node with URLStore, Kubo's URL-backed block store. The node keeps directory
metadata, hashes and block offsets locally. On a cold read, a private origin
retrieves the approved byte range from the recorded S3 version. Keep the origin,
Kubo RPC and local gateway on loopback.

1. Rehearse offline with one synthetic HLS fixture, a fresh node identity and an
   empty repository. Verify the root content identifier (CID), object hashes,
   and playback after restart. Take the origin offline briefly and check that a
   cold read fails, then restore it and verify the bytes again.
   [Dedicated node setup and checks](https://github.com/yegamble/vidra/blob/main/deploy/ipfs-reference/runtime/README.md)
2. Vidra Core v0.7.32 adds the `ipfs_public_reference_videos` eligibility view
   in migration 194. Give the preparation role `SELECT` on that view and give
   its S3 reader access to the selected native HLS generation. Run the preparer
   for one Vidra video UUID and review every object's version, length and SHA-256.
   If the view has no row for that UUID, the preparer refuses the request.
   Legacy PeerTube HLS layouts are excluded. On v0.7.31, the dedicated
   deployment tools support the synthetic rehearsal.
   [v0.7.32 manifest preparation](https://github.com/yegamble/vidra/blob/v0.7.32/deploy/ipfs-reference/PREPARATION.md)
3. Obtain approval for that video and its intended network. Install the reviewed
   manifest and use the operator publisher to pin it on the dedicated node.
   Enable public peering only for material approved for global distribution.
   After publication, check the CID and playback from an independent peer.
   To withdraw locally, remove the origin approval and reconcile the managed
   pin with the publisher. Other peers can retain their copies.
   [Publish and withdraw an approved video](https://github.com/yegamble/vidra/blob/main/deploy/ipfs-reference/publisher/README.md)

Keep the journal in the encrypted recovery kit and retain the exact source
versions in recoverable storage. [Reference-node recovery](./production.md#recovering-an-ipfs-reference-node)

On v0.7.35 or later, a host administrator can enable the reference reporter
to show verified pin counts in **Admin → System**. Install its service
and timer on the node with access to the approval manifests, publisher receipts
and local Kubo gateway. Set `IPFS_REFERENCE_STATUS_DIR` on the API host to the
dedicated directory where the reporter delivers its status file. Vidra mounts
this directory read-only. A separate reporter host needs an authenticated
transfer that preserves the observation time. Continue to approve each new
pin through the publisher. [Reporting reference pin health](https://github.com/yegamble/vidra/blob/v0.7.35/deploy/ipfs-reference/runtime/README.md#reporting-reference-pin-health-in-vidra)

## Backing up local media

The volumes, as Docker names them (the compose project is `vidra`):

| Volume | Holds | Back it up? |
|---|---|---|
| `vidra_media_data` | `/app/data` — originals, HLS renditions, thumbnails, storyboards | **Yes**, when `STORAGE_BACKEND=local`. This is the one. |
| `vidra_caddy_data` | ACME account key and issued certificates | Worth it. Losing it re-orders every certificate, and Let's Encrypt's duplicate-certificate limit is 5 per week. |
| `vidra_caddy_config` | Caddy's autosaved JSON config | No — regenerated from `Caddyfile.local`, which the config archive carries. |
| `vidra_ipfs_data` | Pinned content, with the `ipfs` profile on | Yes, if you are the only pinner. |
| `vidra_postgres_data` | The database | No — `backup.sh` dumps it, which is portable across majors; a raw volume copy is not. |
| `vidra_transcode_tmp` | ffmpeg scratch | No. Genuinely disposable. |
| `vidra_live_hls` | In-flight live segments | No. Replays land in `media_data`. |
| `vidra_search_models` | Trained ranking models | No — regenerated by training. |
| `vidra_whisper_models`, `vidra_clamav_data` | Downloaded model and signature data | No — re-downloaded on demand. |

Snapshot without stopping anything, **after** the nightly dump so files are never
older than the rows:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
docker run --rm \
  -v vidra_media_data:/src:ro \
  -v "$PWD/backups":/dst \
  alpine tar czf "/dst/media_data-${STAMP}.tar.gz" -C /src .

rclone copyto "backups/media_data-${STAMP}.tar.gz" \
  "${BACKUP_RCLONE_REMOTE%/}/media_data-${STAMP}.tar.gz"
```

Restore is the mirror image, into a volume the stack is **not** running against:

```bash
docker volume create vidra_media_data
docker run --rm -v vidra_media_data:/dst -v "$PWD/backups":/src:ro \
  alpine sh -c 'tar xzf /src/media_data-<stamp>.tar.gz -C /dst'
```

Two honest caveats. This is **not** wired into `backup.sh` or the timer: a media
volume is orders of magnitude larger than a dump, the right cadence differs per
instance, and a nightly job that silently fills the disk it is protecting is
worse than a documented manual step. And `tar` over a live volume is
crash-consistent, not point-in-time — a file being written during the snapshot
may be truncated in it. If media matters more than that, the answer is
`STORAGE_BACKEND=s3`.

## Verifying the store against the database

```bash
# fast: does every referenced object exist?
docker compose … run --rm api verify-blobs --timeout=10m

# thorough: re-download and compare digests, and walk each HLS tree
docker compose … run --rm api verify-blobs --hash --deep --timeout=4h
```

`restore.sh` runs the fast pass automatically and never blocks on it. Run the
`--hash` form after a bucket-level restore or provider incident, after moving the
media store, and on whatever periodic schedule you are willing to pay the reads
for — it is a full read of every original.

Never run it **during** a storage migration, when the two stores are deliberately
out of step. `vidra doctor`'s **storage migration** check reports that state
before you start.

## Moving between backends

There is a managed path for this: the admin storage-migration API at
`/api/v1/admin/storage/migrations`, with `/{id}` to poll and `/{id}/cancel` to
stop. It verifies each copy in flight. Drive it from the admin console rather
than by hand.
