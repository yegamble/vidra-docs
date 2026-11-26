---
title: What is Vidra?
description: A federated video platform you install yourself, under AGPL v3.
---

# What is Vidra?

Vidra is a federated video platform you install yourself, the way you would
install WordPress. One low-cost server serves your viewers because distribution
is designed to be offloaded — HLS from your own box, a CDN in front of it, or
IPFS gateways carrying public media. It federates over ActivityPub and ATProto,
stores media on anything S3-compatible if you want it to, and it is free
software under AGPL v3.

It is a **clean-room, PeerTube-inspired implementation** — not a fork of
PeerTube, and not API-compatible with it. It has its own HTTP contract, its own
schema and its own client. What it does carry across is your data: a one-way
importer moves a whole PeerTube instance into Vidra, which is what
[Migrate from PeerTube](../migration/overview.md) covers.

## Three things it is built around

**Low egress at scale.** Media is served from your own origin, but nothing
forces it to stay there. Put a CDN in front of it, or turn on the IPFS mirror
and let public gateways carry public media. Local or S3-compatible storage stays
authoritative either way.

**Federated by default, over two protocols.** ActivityPub federates channels to
the fediverse. ATProto carries identity — sign in with Bluesky or any PDS — and
optionally cross-posts your public videos there. They are separate systems doing
separate jobs; see [Federation](../concepts/federation.md).

**Yours to run.** AGPL v3, one compose file, no vendor between you and your
viewers. The whole install on a fresh Ubuntu or Debian server is one command,
and every operator task after that is one `vidra` subcommand.

## What is in the box

| Area | What ships |
|---|---|
| Publish | Direct, chunked/resumable and async URL uploads; per-user quotas; optional ClamAV scanning; H.264/AAC HLS ladder with I-frame trick-play and an optional VP9/WebM alternate; thumbnails, storyboards, chapters |
| Live | RTMP ingest with privacy-gated HLS and replay-to-VOD |
| Watch | A bespoke player with keyboard shortcuts, picture-in-picture and theatre mode; WebVTT captions with optional Whisper generation; playlists, subscriptions, history, trending; embeds, RSS, oEmbed, sitemap; installable as a PWA |
| Find | A separate search service — hybrid full-text plus trigram, typo-tolerant autosuggest, trending, recommendations — that core degrades around if it is down |
| Connect | Sign in with Bluesky or any ATProto PDS; OAuth/OIDC; TOTP two-factor; 1:1 direct messages with opt-in client-side-Olm end-to-end encryption |
| Moderate | Reports that notify staff, per-user sensitive-content policy, registration approval, an admin console over a runtime-mutable settings registry |
| Operate | `/healthz`, `/readyz`, `/schemaz`, `/admin/system`; Prometheus metrics; OpenTelemetry traces; scripted deploy, rollback, backup and restore; the `vidra` operator CLI |

Accessibility is not optional here: WCAG 2.2 AA is enforced by axe as a hard CI
gate in the frontend repo.

## What Vidra is not

- **Not a hosted service.** There is no vidra.com to sign up for. You run it.
- **Not a PeerTube fork, and not API-compatible with PeerTube.** PeerTube
  clients, embeds and plugins do not work against a Vidra instance.
- **Not a creator monetisation platform.** There is no payments system, no
  cryptocurrency integration and no revenue share.
- **Not in-player peer-to-peer, yet.** Viewer-to-viewer distribution inside the
  player is deferred by decision. IPFS is the shipped distribution-offload
  mechanism; see [Storage and media](../concepts/storage-and-media.md).

## Next

- [Quickstart](./quickstart.md) — one server, three steps.
- [Requirements and sizing](./requirements.md) — before you buy the box.
- [Architecture](../concepts/architecture.md) — how the pieces fit.
