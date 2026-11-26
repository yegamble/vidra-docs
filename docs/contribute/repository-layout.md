---
title: Repository layout
description: A meta-repo plus three service repos, and the CI each one runs.
---

# Repository layout

Four repositories. Three of them are the product; one ties them together.

| Repo | What | Stack |
|---|---|---|
| [`vidra`](https://github.com/yegamble/vidra) | **Meta-repo.** Compose files, `install.sh`, `deploy/`, env templates, the Makefile. Clones the other three. | Bash, make, compose |
| [`vidra-core`](https://github.com/yegamble/vidra-core) | Backend and HTTP API. Also carries `cmd/vidra` (the operator CLI) and `cmd/peertube-import`. | Go, Echo, PostgreSQL, sqlc, Redis |
| [`vidra-user`](https://github.com/yegamble/vidra-user) | Frontend. | Next.js, TypeScript, Tailwind |
| [`vidra-search`](https://github.com/yegamble/vidra-search) | Search, autosuggest and recommendations. | Go, PostgreSQL, Redis |

Plus [`vidra-branding`](https://github.com/yegamble/vidra-branding) — brand
guidelines, the identity system, governance and the design-system reference —
and [`vidra-docs`](https://github.com/yegamble/vidra-docs), this site.

Each component repo is **self-contained**: its own `go.mod` or `package.json`,
its own Docker setup, its own CI. `./vidra-core`, `./vidra-user` and
`./vidra-search` inside a meta-repo checkout are independent git checkouts,
git-ignored by the meta-repo, created and updated by `bootstrap.sh`.

## Why a meta-repo, not submodules

The components talk only over HTTP at runtime, and each repo is released
independently. A submodule pins a commit SHA and forces a
commit-child → bump-pointer → push-parent transaction on every sync. The
meta-repo gives the same "one place to clone and run" without any of that.

## CI

| Repo | Workflows |
|---|---|
| **vidra-core** | `backend-ci` (`make ci`), `backend-integration`, `openapi`, `schema-compat` (previous-release compatibility), `ci-guard`; plus `bench-fuzz`, `ipfs-integration`, `publish-container` on release |
| **vidra-user** | `frontend-ci` (`npm run ci`), `contract-ci`, `frontend-e2e-backed`, `ci-guard`; plus `publish-container` |
| **vidra-search** | `search-ci` (`make ci`), `search-integration`, `openapi`, `training-ci`, `ci-guard`; plus `publish-container` |
| **vidra** (meta) | `meta-ci` — validates `bootstrap.sh` and the full-stack compose config, and asserts the rendered production config exposes nothing beyond caddy 80/443, rtmp 1935 and ipfs 4001 |

Each repo carries further workflows; see its `.github/workflows/`.

Two gates are worth calling out because they are contracts rather than
conveniences:

- **`contract-ci`** asserts every `/api/` path the frontend calls exists in
  `vidra-core/api/openapi.yaml`, and fails if the generated client is stale.
- **axe accessibility is a hard CI gate** in `vidra-user`. WCAG 2.2 AA is
  enforced, not aspired to.

## Release mechanics

Images are `ghcr.io/yegamble/{vidra-core,vidra-user,vidra-search}:vX.Y.Z`, built
**only from tags** by each repo's `publish-container.yml` on `release: published`.
The meta-repo is tagged too — first, and without a release — because vidra-core's
`release-assets.yml` builds the deployment bundle by checking the meta-repo out
at the same tag. That gives the bundle a provenance: one meta commit, one core
commit, both recorded in `vidra-bundle.manifest`.

Release all three components at the same version. Nothing enforces it, but
`rollback.sh v0.5.0` sets all three tags from one argument, and "which build is
running?" during an incident should have one answer.

## Docs in the product repos

| Doc | What |
|---|---|
| [`vidra/deploy/README.md`](https://github.com/yegamble/vidra/blob/main/deploy/README.md) | The reference single-host deployment, end to end. The source for most of this site's Install and Operate pages. |
| [`vidra/docs/productionization/`](https://github.com/yegamble/vidra/tree/main/docs/productionization) | The productionization program: phases, interfaces, risks, and the architecture audit snapshot. |
| [`vidra-core/docs/operations.md`](https://github.com/yegamble/vidra-core/blob/main/docs/operations.md) | Backend operations, including the PeerTube importer's findings from a real migration. |
| `vidra/.ralph/specs/` | Living product specs: architecture, security, testing, search, environments, and the PeerTube feature-parity ledger. |

## Autonomous development

Each Go and frontend repo runs a per-repo loop inside its own checkout:

```bash
cd vidra-core && ralph --live
cd vidra-user && ralph --live
```

Each loop commits and pushes its own repo's `main`, so there is no cross-repo
pointer to bump. For an API change spanning both, run them sequentially, backend
first. The meta-repo's root `.ralphrc` and `.ralph/PROMPT.md` are legacy and
drive nothing; `.ralph/specs/` is preserved there as product docs.
