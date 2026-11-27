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
