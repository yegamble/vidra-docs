---
slug: docs-relaunch
title: The docs now describe the product
authors: [vidra]
tags: [documentation]
date: 2026-08-28
---

This site has been rebuilt against the product as it exists today. The previous
version described an earlier project, and it described it inaccurately.

<!-- truncate -->

## What was wrong

The old pages asserted PeerTube REST API compatibility, in-player WebTorrent
peer-to-peer, a cryptocurrency payments integration, Kubernetes manifests and
Terraform configurations, and a `k8s/` directory. None of those exist. The
prerequisites named versions the project has not used for some time, and the
repository links pointed somewhere else entirely.

A wrong page is worse than a missing one. Anything that could not be verified
against [`github.com/yegamble/vidra`](https://github.com/yegamble/vidra) has been
removed rather than softened.

## What is true

**Vidra is a clean-room, PeerTube-inspired implementation.** It is not a fork
and it is **not API-compatible with PeerTube** — PeerTube clients, embeds and
plugins do not work against it. What is supported is a one-way importer that
moves an existing PeerTube instance across, and it carries more than the old
docs claimed: bcrypt password hashes come over verbatim, so your users keep the
passwords they already have.

**Federation is two protocols doing two jobs.** ActivityPub federates channels
to the fediverse; ATProto carries identity — sign in with Bluesky or any PDS —
and optional cross-posting. Both default to off, both are switchable per channel,
and neither is the other.

**IPFS is the shipped distribution offload**, as a dual-tier mirror: a public
gateway tier and a private swarm-keyed tier, with local or S3-compatible storage
staying authoritative. In-player peer-to-peer is deferred by decision, and the
docs now say so.

**Deployment is a one-line installer, Docker Compose, and the `deploy/*.sh`
scripts** that the `vidra` CLI wraps 1:1. There are no orchestrator manifests to
find, because there are none to ship.

## What is new

A curated information architecture: Start here, Concepts, Install and deploy,
Operate, Migrate from PeerTube, Reference, Contribute. New pages cover
requirements and sizing with the real hardware floor, the operator CLI and its
checks, monitoring, the port matrix, and repository layout.

The theme now follows the
[brand guidelines](https://github.com/yegamble/vidra-branding) — Paper and Ink
with Action Cyan — and the architecture diagrams are authored as Mermaid, so
they read correctly in both light and dark rather than being colour-inverted by
a CSS filter.

Start at [What is Vidra?](/docs/start/what-is-vidra), or go straight to the
[Quickstart](/docs/start/quickstart).
