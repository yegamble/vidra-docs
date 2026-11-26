---
title: REST API
description: Where the OpenAPI contract lives and how to browse it.
---

# REST API

The HTTP API's source of truth is a single OpenAPI document:

> **[`vidra-core/api/openapi.yaml`](https://github.com/yegamble/vidra-core/blob/main/api/openapi.yaml)** — 228 paths.

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

## No PeerTube compatibility

Vidra is a clean-room implementation with its own contract. **PeerTube clients,
embeds and plugins do not work against it**, and no endpoint here mirrors
PeerTube's shapes. Moving an existing instance is a data migration, not a client
swap — see [Migrate from PeerTube](../migration/overview.md).
