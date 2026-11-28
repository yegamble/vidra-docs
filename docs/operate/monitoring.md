---
title: Monitoring and health
description: Probes, the admin snapshot, Prometheus metrics and OpenTelemetry traces.
---

# Monitoring and health

## Probes

| Endpoint | Auth | What it reports |
|---|---|---|
| `GET /healthz` | none | Liveness. |
| `GET /readyz` | none | Readiness, including Postgres and Redis. This is the one an orchestrator ticks. |
| `GET /schemaz` | none, **host-local only** | The running build **and** the migration ledger: `{"software":{…},"schema":{"version","dirty","applied"}}`. |
| `GET /version` | none | Build version. |

Point an external uptime check at `https://<domain>/healthz` **and** at the site
root — an internal check cannot tell you the certificate expired.

`/schemaz` is deliberately **not edge-routed**: `deploy/Caddyfile` proxies a
root-path allow-list and this is not on it. Reach it from the host:

```bash
curl -s http://127.0.0.1:${HTTP_PORT:-8080}/schemaz
```

It always answers 200, including when the database is unreachable — the error
goes inside the document, because a 5xx cannot distinguish "no api" from "api up,
database gone". `vidra status` and `vidra doctor` use it to ask "what is this
instance at" without psql.

The **frontend** container has its own `/healthz`, reachable only inside the
container — the edge routes `/healthz` to the api. It is what the production
compose healthcheck probes, because a `/` render awaits the api and so cannot
report on the frontend alone.

## The operator snapshot

`GET /api/v1/admin/system`, with an admin JWT: status, versions, uptime,
dependency health and effective non-secret configuration.

Dependency health covers **six components** — Postgres, Redis, the object store,
the SMTP relay, the search service and the ffmpeg binary — probed concurrently,
3 s each, and **only when the page is opened**. `not_configured` (local storage,
mail off, no search service) is a supported deployment and never degrades the
instance.

`/readyz` deliberately keeps its cheap two-dependency contract, because that one
runs on every orchestrator tick.

Verifying you actually have admin is the same call: it must return 200, and a
non-admin gets 403.

### Check S3 reference pins

From v0.7.35, open **Admin → System** on an instance with the optional
reference reporter. **IPFS reference pinning** shows the last check and the
number of approved video roots the reporter verified. **IPFS asset mirror**
shows the status of the standard mirror. A deployment using S3 references
alone can have healthy reference pins while its asset mirror is unconfigured.

**Verified pins** shows zero after the reporter verifies an empty approval and
pin inventory. **Unknown** means the API has no current verified count. If
**Last checked** is more than five minutes old, check the reference host's
`vidra-reference-status.timer` and its service journal. If the timestamp is
more than 30 seconds ahead, check the clocks on the API and reference hosts. If the report is
current and degraded, follow its diagnostic. A pin mismatch calls for checking
approvals and the publisher journal. A media verification failure calls for
checking the local gateway and the immutable S3 object version.

The reporter checks the selected playlists and compares a sample of media
bytes. To verify playback from the global network, fetch the approved CID
from an independent peer. [Reference reporter installation and diagnostics](https://github.com/yegamble/vidra/blob/v0.7.35/deploy/ipfs-reference/runtime/README.md#reporting-reference-pin-health-in-vidra)

#### A video was made private while pinned

A fresh `pin_set_mismatch` can occur even when Kubo has exactly the roots in the publisher journal. The native origin also checks the video's current visibility and transcode generation. A formerly public video can return 404 at the origin while its old pin remains on the node. The scheduled reporter flags this condition. An operator must reconcile the pin.

1. In **Admin → System**, refresh the details and check the observation time. Confirm the video and generation against the live catalogue. If the eligibility service is unavailable, restore it before making a withdrawal decision.
2. For a confirmed withdrawal, keep the video private and switch the dedicated reference node offline. Move its manifest outside the active approval directory, then run the publisher with `-reconcile`, the original manifest path and the journal and RPC settings for that publication. It releases the managed pin. Peers that already received the content can retain their copies. [Publisher withdrawal procedure](https://github.com/yegamble/vidra/blob/v0.7.36/deploy/ipfs-reference/publisher/README.md#withdraw-and-recover)
3. Before resuming peering, verify the remaining pins and local block inventory against the surviving approvals. Unpinning can leave blocks in the repository. If unexpected blocks remain, keep the node offline and rebuild from the surviving approvals in an empty repository. After the inventory passes, resume peering, check the next scheduled health observation and retrieve a remaining approved clip from a fresh peer. [Reference node admission and recovery](https://github.com/yegamble/vidra/blob/05962092f268d3ab9cbdc7cb165ff8855e678629/deploy/ipfs-reference/runtime/README.md#verify-and-switch-a-synthetic-node-to-public-peering)
4. Record the withdrawal alongside the recovery kit. During a restore, start offline and exclude the withdrawn approval from the active directory. An older kit can contain both the original manifest and a journal that still lists its pin.

### Monitor migrated watch links

From v0.7.36, a visible PeerTube video at `/w/{shortUUID}` still redirects to
its Vidra watch page with HTTP 302. An unknown or unavailable item can return
404. If the resolver is rate-limited, the legacy route returns 429. A timeout,
unreachable backend or upstream server error produces 503. The same temporary
responses apply to `/videos/watch/{id}` and `/videos/embed/{id}`.

These temporary responses include `Cache-Control: no-store` and carry a
numeric `Retry-After` when the upstream sent one. The frontend allows five
seconds for the anonymous video lookup. If 429s recur under normal use, check
the trusted reverse-proxy configuration so the origin can apply each
viewer's rate limit.

To investigate a spike, compare redirect and error counts for browser watch
links with resolver responses over the same time window. Compare playable
media requests and first-frame measurements separately. A visitor who receives
an error before the player mounts cannot send a first-frame measurement.
[Video resolver responses](../reference/rest-api.md#migrated-video-identifiers-and-dates)

## Prometheus metrics

`METRICS_ENABLED=true` exposes RED metrics at `/metrics`.

:::danger `/metrics` is unauthenticated, and the edge 404s it
The route is root-mounted with no auth, which is why `deploy/Caddyfile` answers
404 for it unconditionally. **Scrape it from inside the compose network, never
through Caddy.**
:::

The registries are deliberately bounded-cardinality — an unbounded label is how a
metrics endpoint takes down the process it is measuring.

## OpenTelemetry traces

```bash
VIDRA_COMPOSE_PROFILES="… otel"
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_SERVICE_NAME=vidra-api
FRONTEND_OTEL_SERVICE_NAME=vidra-frontend
```

The api, the frontend and the search service all read the `OTEL_*` variables.
The api and frontend keep **distinct service names** so their spans stay
distinguishable.

:::warning Enabling OTel without an endpoint is a hard boot failure
`OTEL_ENABLED=true` with no `OTEL_EXPORTER_OTLP_ENDPOINT` refuses to start,
rather than silently dropping every span.
:::

The `otel` profile brings up a collector (4317 gRPC, 4318 HTTP) and Jaeger
(16686) for local inspection.

## Job and queue observability

Background work runs on durable Postgres queues with backoff and dead-lettering,
claimed with `FOR UPDATE SKIP LOCKED` plus a lease. Job state is observable over
REST and SSE with cursor replay and redaction, so a console can attach to a
running job and catch up on what it missed rather than only seeing what happens
next.

The audit envelope uses an allow-list plus a `sensitiveKeys` denylist, with a
static guard test — so a new field cannot quietly start being logged. A
correlation-id chain runs end to end.

### Retry an upload after a scanner error

From v0.7.37, an operator can retry a failed upload whose original is still in storage and whose upload session has time remaining. Start with the video ID and correlation ID from the failed `upload_finalize` job. Check the scanner is healthy. A job can remain in the history after its creator deletes the video. Leave deleted videos alone.

In `psql` on the application database, look up the current candidate for that video.

```sql
\prompt 'Video UUID ' video_id
SELECT upload_id, owner_id, privacy, sha256, size_bytes, expires_at
FROM retained_scan_sources
WHERE video_id = :'video_id'::uuid
  AND session_state = 'failed'
  AND expires_at > now();
```

Continue only when the row matches the original, owner and visibility you intend to recover. An empty result means there is no eligible upload for this video. Infection, moderation, newer uploads and previously generated renditions can all affect eligibility.

Set `UPLOAD_ID`, `OWNER_ID`, `PRIVACY` and `SHA256` from the verified row. From the deployment directory, run the preview.

```bash
./deploy/compose.sh exec -T api /app/api recover-scan-upload \
  --upload "$UPLOAD_ID" --owner "$OWNER_ID" --privacy "$PRIVACY" --sha256 "$SHA256"
```

The preview checks that the retained object exists and its size matches. It reports `eligible, … bytes, dry run` when it passes. A successful retry can publish a video with public visibility under its existing publication settings. To queue the rescan, repeat the same command with `--apply`.

The worker verifies the original bytes against the recorded checksum and runs normal ingestion with fail-closed scanning. Watch the new finalize job in the admin panel, then check playback under the video's current visibility. Repeating an accepted request reports the existing recovery job's state. The first failed job remains in the history.

## What to watch after a deploy

```bash
vidra status
vidra doctor
./deploy/compose.sh logs -f api | grep -i error
curl -fsS http://127.0.0.1:8080/readyz
```

The first 24 to 48 hours after a cutover or a large import are when the
interesting failures show up: media the database references but the store does
not have, a search service that is silently disabled, a backup timer that
enabled cleanly and has never actually run.

`vidra doctor` covers all three, and its exit code is 0 unless something failed —
run it as a pre-deploy gate.
