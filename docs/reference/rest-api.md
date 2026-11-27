---
title: REST API
description: Where the OpenAPI contract lives and how to browse it.
---

# REST API

Use the OpenAPI document for the release your instance runs. Check the version
at `GET /version`. [v0.7.32 API contract](https://github.com/yegamble/vidra-core/blob/v0.7.32/api/openapi.yaml) · [Development contract](https://github.com/yegamble/vidra-core/blob/main/api/openapi.yaml)

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

For display, use `published_at` when present, with `created_at` as the fallback.
The optional `originally_published_at` records first publication elsewhere.
For a channel listing, `GET /api/v1/channels/{handle}/videos?sort=-published_at`
requests newest first. Vidra has its own client contract and recognizes
selected PeerTube browser and embed URLs. [Guide for returning viewers](../migration/returning-users.md)

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

## IPFS status and per-video reference pins

Administrators can query `GET /api/v1/ipfs/status` for the configured Vidra
mirrors. With both standard mirrors disabled, it returns `503 ipfs_disabled`.
A dedicated S3 reference node has its own operator workflow. Check that node's
recursive pins through its authenticated local Kubo RPC and reconcile the
selected manifest with the reference publisher. Verify playback by fetching
the directory CID from an independent peer after public peering is approved.
[Versioned S3 reference pins](../install/storage-backends.md#versioned-s3-reference-pins)

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
