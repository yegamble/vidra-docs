---
title: REST API
description: Where the OpenAPI contract lives and how to browse it.
---

# REST API

Use the OpenAPI document for the release your instance runs. Check the version
at `GET /version`. [v0.7.36 API contract](https://github.com/yegamble/vidra-core/blob/v0.7.36/api/openapi.yaml) · [Development contract](https://github.com/yegamble/vidra-core/blob/main/api/openapi.yaml)

There is no generated reference on this site yet. Publishing one from that spec
is a tracked follow-up; until it exists, browse the spec itself rather than a
second-hand copy that could disagree with it.

## Browsing it

```bash
# Read it locally
git clone https://github.com/yegamble/vidra-core.git
$EDITOR vidra-core/api/openapi.yaml

# Or render it in any OpenAPI viewer, e.g.
npx @redocly/cli preview-docs vidra-core/api/openapi.yaml
```

Every path is under `/api/v1` except the root-mounted probes (`/healthz`,
`/readyz`, `/version`, `/schemaz`). Root-mounted **federation** and
**distribution** surfaces — WebFinger, NodeInfo, actor documents and inboxes,
`/feeds/videos.xml`, `/services/oembed`, `/sitemap.xml` — are deliberately
**outside** this contract: they are protocol surfaces, not REST endpoints, and
they mount only when their feature is enabled. See
[Federation](../concepts/federation.md).

## Drift is guarded, in both directions

`vidra-user` regenerates its client from the spec with `npm run codegen`, and its
types are derived from that — **never hand-edit the generated shapes**.
`contract-ci` guards drift twice:

1. `scripts/check-contract.mjs` asserts every `/api/` path the frontend calls
   exists in the spec.
2. A codegen step fails if the generated client is stale.

In CI the spec is fetched from the public `vidra-core` repo; locally the sibling
`../vidra-core` checkout is used.

## Changing the API

A breaking change spans two repos with no atomic commit, so stage it
back-compat:

1. Land the **additive**, back-compat change in `vidra-core` — its `openapi`
   workflow publishes the updated spec.
2. Update `vidra-user` to the new shape.
3. Remove the old endpoint in a **later** `vidra-core` change.

## The internal search contract

`vidra-search` has a **separate** contract at
[`vidra-search/api/openapi.yaml`](https://github.com/yegamble/vidra-search/blob/main/api/openapi.yaml),
entirely under `/internal/v1`, HMAC-authenticated and consumed only by
`vidra-core`. It is never exposed to a browser and is staged back-compat the same
way.

## Migrated video identifiers and dates

`GET /api/v1/videos/resolve` accepts exactly one query parameter. Supply
`legacy_uuid` for the source video's UUID or `code` for Vidra's 11-character
watch code. Keep PeerTube's short watch identifier in its original `/w/…`
browser URL. This read uses the same access checks as `GET /api/v1/videos/{id}`.

| Response | Meaning |
|---|---|
| 200 | The caller can read the video. |
| 400 | Both identifiers were supplied, or neither was supplied. |
| 401 | Read the error code. `sign_in_required` identifies a members-only video and `password_required` identifies a video that requires a video password. |
| 404 | The identifier is malformed or unknown, or the video is unavailable to this caller. |
| 429 | The request exceeded its rate limit. Wait for the delay in `Retry-After` when present. |
| 503 | From v0.7.36, `database_unavailable` indicates an unavailable database and `request_timeout` indicates an expired request deadline. Retry later. |

The 503 response also applies to `GET /api/v1/videos/{id}`. A client that
stores video availability should leave it unchanged after a 429 or 503.
PeerTube watch and embed links can return these temporary statuses directly.
[Monitoring migrated watch links](../operate/monitoring.md#monitor-migrated-watch-links)

For display, use `published_at` when present, with `created_at` as the fallback.
The optional `originally_published_at` records first publication elsewhere.
For a channel listing, `GET /api/v1/channels/{handle}/videos?sort=-published_at`
requests newest first. Vidra has its own client contract and recognizes
selected PeerTube browser and embed URLs. [Guide for returning viewers](../migration/returning-users.md)

## Filter the account directory

In core v0.7.34 or later, administrators and moderators can request
`GET /api/v1/admin/users?q=alex&filter=staff&limit=10&offset=0`.
The optional `q` matches a username or email substring. The `filter` parameter
accepts `all` (the default), `staff` or `deactivated`. An unknown filter
returns 400.

The response includes `users`, `total`, `limit`, `offset` and `counts`.
Use `total` to paginate the selected group. Use `counts.all`, `counts.staff`
and `counts.deactivated` for the full search, regardless of the current page
or selected group. Staff includes administrators and moderators. Deactivated
includes inactive accounts that can still be reactivated. Permanently deleted
records remain in All. Results are ordered newest first with the account ID
breaking ties.

## Account recovery and operator contact

| Request | Result |
|---|---|
| `POST /api/v1/auth/password-reset` with `email` | A valid request returns 202 regardless of whether an active account matches. The matching user receives a single-use link when mail is available. |
| `POST /api/v1/auth/password-reset/confirm` with `token` and `password` | 204 sets the password and revokes existing sessions. An invalid, expired or previously used token gives 400. |
| `POST /api/v1/instance/contact` with `from_name`, `from_email`, `subject` and `body` | Available anonymously when `GET /api/v1/instance` reports `contact_form_enabled`. Returns 202 on acceptance, 409 when disabled, or 429 when rate limited. |

A successful password check for a Vidra account with MFA enabled returns
`mfa_required` and a short-lived `mfa_token`. Complete the challenge at
`POST /api/v1/auth/mfa/challenge` to obtain a session. An account imported
with a PeerTube authenticator needs operator-assisted recovery first.

## Creator AT Protocol connection

These Vidra endpoints require the creator's session. A linked account has a
handle, a DID (decentralized identifier), a PDS URL and an auto-post setting.

| Method and path | Result |
|---|---|
| `GET /api/v1/me/atproto` | Returns 200 with the connection, including `last_posted_at` when available. A creator with no link gets 404. |
| `PUT /api/v1/me/atproto` | Creates or updates the link using `handle`, `app_password`, optional `pds_url`, and `auto_post`. A successful credential check returns 200 with the saved connection. |
| `DELETE /api/v1/me/atproto` | Removes the caller's connection and returns 204. Repeating the request is safe. |

Use a revocable app password. Vidra omits it from every response. Check the
PDS address and app password on a 422. A 502 indicates an upstream connection
failure. An authenticated 503 indicates the instance has disabled cross-posting.

For a hosted PDS, use its own HTTPS origin for XRPC. For example,
`GET /xrpc/com.atproto.server.describeServer` reports its service DID,
`availableUserDomains` and `inviteCodeRequired`.
[Connecting a creator account](../concepts/federation.md#connecting-a-creator-account)

## Resumable video uploads

1. For an owned draft, `POST /api/v1/videos/{id}/upload-session` with the file's `filename` and exact byte `size`. Use the `chunk_size`, `total_chunks`, `upload_id` and expiry returned by the server. A file above the per-video cap receives `413`. A total or daily quota refusal receives `422`.
2. Send each file slice as `application/octet-stream` to `PUT /api/v1/uploads/{upload_id}/chunks/{n}`, starting at index zero. After an interruption, read `GET /api/v1/uploads/{upload_id}` and send the missing indices. Each chunk except the last must have the advertised size.
3. `POST /api/v1/uploads/{upload_id}/complete` queues finalization and returns `202`. Poll the session through `queued` and `processing`. On `failed`, show `failure_reason`. On `completed`, fetch `GET /api/v1/videos/{id}` for the video's own state and playback availability.

Use the same authenticated account throughout. A retry after token renewal can resend the same chunk index with the same bytes. [How uploads become playable](../concepts/video-pipeline.md#when-an-upload-reaches-100)

Instances with the local large-upload processor accept at most 21,474,836,480 declared bytes through the ordinary resumable session. Above 2,147,483,645 bytes, the retained playback and download source is the scanned, reconstructed MP4. Size checks and daily quotas use the declared or transferred source size. The processing policy and staging filename are server-managed. A client uses the same chunk and status endpoints throughout. [Large source processing](../concepts/video-pipeline.md#uploading-a-large-source-file)

## IPFS status and per-video reference pins

Administrators can query `GET /api/v1/ipfs/status` for the configured Vidra
mirrors. With both standard mirrors disabled, it returns `503 ipfs_disabled`.
A dedicated S3 reference node has its own operator workflow. Check that node's
recursive pins through its authenticated local Kubo RPC and reconcile the
selected manifest with the reference publisher.

From v0.7.35, administrators can read `GET /api/v1/admin/system` for the
optional `components.ipfs_reference` verdict. Read its `status`, the `error`
diagnostic when present, and its `detail` fields. `probed_at` is the reporter's
RFC 3339 observation time. `pinned` is a string containing the verified number
of approved roots. An omitted count means unknown. An explicit `"0"` means
the reporter verified zero. The API drops stale counts and reports a degraded
verdict when the observation is more than five minutes old or more than 30
seconds ahead. `components.ipfs` continues to describe the
standard asset mirror. [Interpreting reference pin health](../operate/monitoring.md#check-s3-reference-pins)

## Backup information and recovery

Administrators can read `GET /api/v1/admin/infrastructure`. Its `backups`
section describes the scheduled cadence, expected files and staleness rule.
Use `vidra doctor` on the deployment host to check the recorded backup age.

Backup and restore actions run on the operator's host. `vidra backup` creates
the database dump and configuration archive. Media requires its own recovery
copy or a full install snapshot. `vidra backups list` lists recovery points,
and `vidra backups web` opens the private host console over a tunnel. Site
users should report missing data to the operator. [Install snapshots and recovery](https://github.com/yegamble/vidra/blob/v0.7.31/deploy/SNAPSHOTS.md) · [Private backup console](https://github.com/yegamble/vidra/blob/v0.7.31/deploy/SNAPSHOT-CONSOLE.md)

To test recovery after losing the application host, restore one backup point on
a separate machine using independently held credentials. Verify the database,
configuration and media there, then record the time to playable service.
[Independent host-loss recovery drill](https://github.com/yegamble/vidra/blob/4f2627c003f701699aae923399b6c7f9084ea76d/deploy/RECOVERY-DRILL.md)
