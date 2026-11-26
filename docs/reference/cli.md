---
title: CLI reference
description: Every vidra subcommand and install.sh flag, with what each one wraps.
---

# CLI reference

Two command-line surfaces: the installer, and the `vidra` operator binary.
Narrative usage is in [Operator CLI](../operate/cli.md); this page is the list.

## `install.sh`

```bash
curl -fsSL https://raw.githubusercontent.com/yegamble/vidra/main/install.sh | sh
sh install.sh --help
```

| Flag | Environment variable | Default | What |
|---|---|---|---|
| `--yes` | `VIDRA_YES` | off | Skip the single confirmation. Required where there is no terminal (cron, a Docker build, `</dev/null`). |
| `--ref vX.Y.Z` | `VIDRA_REF` | latest release | Pin a release. |
| `--dir <path>` | `VIDRA_HOME` | `/opt/vidra` | Where the deployment tree goes. |
| `--owner <name>` | `VIDRA_GH_OWNER` | `yegamble` | Install from a fork. |
| `--git` | `VIDRA_INSTALL_GIT` | off | Clone the repos instead of unpacking the release bundle. |
| `--help` | — | — | Print every flag. |

## `vidra`

| Command | What it does |
|---|---|
| `vidra setup` | The configuration interview. Writes `env/production.env` and `deploy/Caddyfile.local`. |
| `vidra doctor` | Run every host-level check against a deployment. Exit 0 unless something failed. |
| `vidra status` | What is running, and whether it answers. |
| `vidra logs [service]` | Tail logs through `deploy/compose.sh`. |
| `vidra claim` | On a fresh instance, print the owner-claim link (`/setup/claim#token=…`) from the api logs. Interactive terminal only. Not in v0.7.5 or earlier; available from the next release. |
| `vidra owner reset` | Print a one-time link that sets the owner's password when mail cannot be delivered; `--remove-mfa` also removes their authenticator. Interactive terminal only. See [Locked out of the owner account](../operate/moderation.md#locked-out-of-the-owner-account). |
| `vidra restart <service>` | Restart one service. |
| `vidra update` | On a git checkout: pin the newest release and deploy. On a bundle install: runs `deploy/pin-release.sh` with the newest release, or the one you name with `--tag vX.Y.Z`, and does not deploy (not in v0.7.5 or earlier, which refuse bundles). See [Upgrade a bundle tree](../install/upgrading.md#upgrade-a-bundle-tree). |
| `vidra deploy` | Execs `deploy/deploy.sh`. |
| `vidra rollback <tag>` | Execs `deploy/rollback.sh`. |
| `vidra backup` | Execs `deploy/backup.sh`. |
| `vidra restore <dump>` | Execs `deploy/restore.sh`. **Destructive.** |
| `vidra release <tag>` | Execs `deploy/release.sh`. |

The last five exec the script of the same name with `ENV_FILE` injected and your
terminal attached, and return its exit code unchanged — same gates, same
refusals, one copy of each. **The scripts remain the source of truth.**

### `vidra setup`

```
usage: vidra setup --template env/production.env.example [flags]
       vidra setup --template env/production.env.example --web
       vidra setup --check env/production.env
```

| Flag | What |
|---|---|
| `--template <path>` | The deployment template to generate from. Required for a generate run. |
| `--check <path>` | Validate an existing env file instead of writing one. |
| `--web` | Serve the nine-step wizard on **loopback** and print a one-time link. |
| `--listen host:port` | Loopback address for `--web`. Default `127.0.0.1:8321`. |
| `--answers <path>` | Read `flag-name = value` lines; argv always wins. |
| `--non-interactive` | Never prompt. |
| `--yes` | Confirm the in-place rewrite of an existing env file. |
| `--from <path>` | A second source for keys the output file leaves blank. Never overrides it. |
| `--rotate <name>` | Replace a named secret. Without it, no existing secret is touched. |
| `--yes-i-know` | Additionally required to rotate a `*_KEK`. It orphans sealed data. |
| `--domain <host>` | The instance's public domain. |
| `--tls-mode <mode>` | `acme`, `acme-staging`, `internal`, `external`, `plain-http`. Chooses topology, not just issuer. |
| `--no-caddy` | Do not render a Caddyfile; another proxy terminates TLS. |
| `--scan` / `--captions` / `--media` / `--otel` / `--ipfs` | Compose profiles, written to `VIDRA_COMPOSE_PROFILES`. Suffix `=false` to turn one off. |
| `--database-url`, `--redis-url`, `--s3-secret-key`, `--smtp-password` | Secrets. Accept `@path`, `-` (stdin, with `--non-interactive`) or a `VIDRA_SETUP_*` variable. |
| `--peertube` | Configure a migration source. Writes it down only; nothing is dialled at setup time. `--peertube=false` closes the import surface. |
| `--peertube-source-url`, `--peertube-source-s3-secret-key` | The same secret indirections. |

Run `vidra setup --help` for the complete, current flag list and the rotatable
secret names.

### `vidra doctor`

```
usage: vidra doctor [-C <deployment directory>] [--env <env file>]
```

| Flag | Default | What |
|---|---|---|
| `--repo <path>`, `-C <path>` | `.` | The deployment directory — the one holding `docker-compose.yml`, `deploy/` and `env/`. |
| `--env <path>` | `env/production.env` | The env file, absolute or relative to `--repo`. |
| `--timeout <duration>` | per-check budget | How long any single check may take before it reports that it could not complete. |
| `--write-probe` | off | Additionally prove the object-store credentials can **write**, by storing a small test object and removing it again. |

Output is one line per check: `✓` passed, `⚠` could not run or a finding that
does not stop a deploy, `✗` a problem to fix, with the suggested fix indented
under anything that is not `✓`. Exit code 0 unless something is `✗`.

## `deploy/*.sh`

The CLI wraps these; they also run standalone. All read the shape of the stack
from the env file through `deploy/lib.sh`, and all honour
`ENV_FILE=env/staging.env`.

| Script | What |
|---|---|
| `deploy/compose.sh` | `docker compose` against the correct chain. **Gates nothing** — use it to read and to stop. |
| `deploy/deploy.sh` | Pin checkouts → dump → pull → gated migrations → up → Caddy reload → probe. |
| `deploy/rollback.sh <tag>` | Rewrite the image tags, pull, restart, re-probe. App only. |
| `deploy/backup.sh` | `pg_dump -Fc` → gzip → config archive → optional off-site → retention → success marker. |
| `deploy/restore.sh <dump>` | **Destructive.** Drop, recreate, `pg_restore -j4`, migrate, verify blobs, re-probe. |
| `deploy/release.sh <tag>` | Guarded release across all three repos, then GHCR verification. |
| `deploy/provision.sh` | Host prep as root: swap, service user, `/opt/vidra`, log cap, unattended-upgrades, backup timer. |
| `deploy/make-bundle.sh` | **Release-time, not host-time.** Assembles `vidra-bundle_<tag>.tar.gz`. |
| `deploy/lib.sh` | **Sourced, not run.** The one copy of the compose-chain assembly. |

## Make targets

```bash
make dev            # backend + search stack; run the frontend on the host for HMR
make up             # full stack in containers, frontend on :3000
make dev-hot        # full stack in Docker with live reload
make dev-hot-logs   # tail the hot-reload stack
make dev-hot-down   # stop it; volumes preserved
make dev-hot-nuke   # DESTRUCTIVE: stop and delete all volumes
make seed           # demo account + @demo channel
make test           # all three repos' canonical CI gates
make e2e-backed     # backend-backed Playwright suite
make logs           # tail all service logs
make down           # stop; volumes preserved
make nuke           # DESTRUCTIVE: stop and delete data volumes
make ipfs-live      # core stack + live public IPFS mirror + private mirror
make env-check      # which env template the compose commands would use
make help           # every target
```

Production and staging targets, all honouring `PROD_ENV_FILE=env/staging.env`:

```bash
make prod-config                  # render + validate the production compose chain
make deploy
make rollback TAG=v0.4.0
make backup
make restore DUMP=… CONFIRM=1     # DESTRUCTIVE
make release VERSION=v0.5.0
make prod-logs / make prod-down
```

## `peertube-import`

The migration importer is a separate binary that ships nowhere and must be built
from source. Its flags are in
[Manual migration](../migration/manual-migration.md).
