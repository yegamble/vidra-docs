---
title: Operator CLI
description: One command per thing an operator does — and what each one wraps.
---

# Operator CLI

`vidra` is a **host-side binary**, not a container command. `install.sh` puts it
in `/usr/local/bin` from vidra-core's release assets, checksum-verified; for a
release cut before those existed, `make build-vidra` in `vidra-core` still
builds one.

```bash
vidra setup --template env/production.env.example   # the configuration interview
vidra doctor                                        # check this deployment
vidra status                                        # what is running, and whether it answers
vidra logs [service]
vidra claim                                         # print the owner-claim link on a fresh instance
vidra owner reset                                   # print a one-time link to set the owner's password
vidra restart <service>
vidra update --check                                # current and newest release; changes nothing
vidra deploy
vidra rollback <tag>
vidra backup
vidra restore <dump>
vidra release <tag>
```

## It wraps the scripts 1:1

`deploy`, `rollback`, `backup`, `restore` and `release` **exec `deploy/*.sh`**
with `ENV_FILE` injected and your terminal attached, and return the script's
exit code unchanged — same gates, same refusals, no second copy of any of them.
`logs`, `restart` and `status` go through `deploy/compose.sh`.

**The scripts remain the source of truth.** Every rule is enforced in them, not
in the CLI. `--yes` and `RESTORE_CONFIRM` reach the script unchanged.

## `vidra setup`

Generates `env/production.env` from the deployment template, filling in your
answers and minting every secret the template leaves blank. Comments and
ordering are preserved, and the file is written mode 0600. It also renders
`deploy/Caddyfile.local` from the `deploy/Caddyfile` template.

```bash
vidra setup --template env/production.env.example        # interactive
vidra setup --template env/production.env.example --web  # nine-step browser wizard
vidra setup --answers a.txt                              # pre-seeded interview
vidra setup --non-interactive --domain … --tls-mode …    # fully scripted
vidra setup --check env/production.env                   # validate an existing file
```

**Re-running is safe.** The file being written is always read back first and
every value it sets is preserved. A secret is only ever replaced when `--rotate`
names it, and rotating a `*_KEK` additionally needs `--yes-i-know`, because it
orphans data already sealed in the database — a separate answer from `--yes`,
which only confirms the in-place rewrite.

**Secrets need not appear on the command line.** `--s3-secret-key`,
`--smtp-password`, `--database-url`, `--redis-url`, `--peertube-source-url` and
`--peertube-source-s3-secret-key` each accept `@path` (read the file), `-` (read
stdin, with `--non-interactive`) or a `VIDRA_SETUP_*` environment variable, and
the interactive prompts read them without echoing. A connection string counts as
a secret: it carries the password inside it.

`--answers <path>` reads `flag-name = value` lines and applies each one the
command line did not already set — argv always wins. It implies nothing else:
without `--non-interactive`, the questions it does not answer are still asked.

The optional components (`--scan`, `--captions`, `--media`, `--otel`, `--ipfs`)
are compose profiles written to `VIDRA_COMPOSE_PROFILES`. Not passing one keeps
whatever the env file already selects; pass `--scan=false` to turn one off
deliberately.

`--peertube` configures a **migration source** and only ever writes it down — at
setup time the stack does not exist, so nothing dials the source. The answers
are shape-checked with the api's own validators, and the import is launched later
from `<domain>/admin/import-peertube`. `--peertube=false` closes the import
surface again.

`--tls-mode` chooses the deployment's **topology**, not just its issuer; see
[Production deployment](../install/production.md#tls-topologies).

## `vidra doctor`

Checks a deployment the way the runbook says to, and prints one line per check —
`✓` passed, `⚠` could not run (or a finding that does not stop a deploy), `✗` a
problem to fix — each with one line of what to do about it.

```bash
vidra doctor
vidra doctor -C /opt/vidra --env env/production.env
vidra doctor --write-probe        # additionally prove the object store accepts writes
```

**The exit code is the contract:** 0 when nothing failed, 1 when something did.
A warning never fails a run, because a command that exits non-zero for warnings
is one every wrapper script learns to ignore. That makes it usable as a
pre-deploy gate.

Every finding is derived from a file, the rendered compose model, the database or
the Docker daemon — **never from what a document says should be true**. It reads;
it changes nothing, creates no bucket and sends no mail.

The checks, in the order they run, which is the order of causation:

| Section | Checks |
|---|---|
| **Stack** | compose version · published ports · log caps · dev override · stray `vidra-core/.env` |
| **Config** | reverse proxy · domain DNS · env file vs template · configuration values |
| **State** | schema ledger · search ledger · db pool sizing · backups · backup timer · off-site backup · disk space · media GC posture · storage migration · cdn purge backlog · instance owner |
| **Reachability** | object storage · object write · object retention · bucket ownership · smtp · search service · ffmpeg · video encoders · hardware transcode |

`--write-probe` is the single exception to "it only reads", and it is opt-in for
that reason: it stores a small object in the media bucket and deletes it again.
A key that can read but not write passes every other object-store check here and
then fails every upload — run it after changing storage credentials and before a
migration.

Checks whose dependency is missing on this host — no systemd on a laptop, no
daemon, a stack that is not up — report `⚠` with the reason rather than failing.

## `vidra status` and `vidra logs`

```bash
vidra status              # what is running, and whether it answers
vidra logs                # tail everything
vidra logs api            # one service
vidra restart api
```

Always use these (or `deploy/compose.sh`) rather than a bare
`docker compose logs api`. On a deployment host the bare form auto-loads
`docker-compose.override.yml` and addresses a **different compose project** than
the deploy scripts do, so you can be reading a stack that is not the one running.

## `vidra claim`

```bash
vidra claim
vidra claim -C /opt/vidra --env env/production.env
```

On a fresh instance, prints the link that claims the owner account:
`<PUBLIC_BASE_URL>/setup/claim#token=<token>`. Run it on the server, in an
interactive terminal, and open the link in your browser — the claim form reads
the token from the `#token=` fragment and removes it from the address bar.

- It reads the newest token from the api logs. Every api restart mints a new
  token and invalidates the previous one, so run `vidra claim` again after a
  restart.
- It prints only to a terminal. A pipe, a redirect or a CI step is refused,
  because the token is a one-time credential for the admin account.
- If the logs hold no token, it says the owner is probably already claimed (or
  the api has not started yet; check `vidra status`).

`vidra claim` is not in v0.7.5 or earlier; it is available from the release after
v0.7.5. On an older CLI, read the token from the api log as
[Quickstart, step 3](../start/quickstart.md#step-3--claim-the-owner-account)
describes.

## `vidra owner reset`

```bash
vidra owner reset
vidra owner reset --remove-mfa
vidra owner reset -C /opt/vidra --env env/production.env
```

For an owner who has lost their password when no reset mail can be delivered.
It prints one link, `<PUBLIC_BASE_URL>/reset-password/confirm?token=<token>`,
that sets the owner's password. Run it on the server, in an interactive
terminal, and open the link in your browser. It runs `api owner-recovery` as a
one-shot of the `api` service, so the stack's database must be up. For the whole
recovery, including when not to use it, see
[Locked out of the owner account](moderation.md#locked-out-of-the-owner-account).

| Flag | What it does |
|---|---|
| `--remove-mfa` | Also deletes the owner's authenticator and recovery codes and signs the owner out everywhere. Asks you to type `remove` first. |
| `--yes` | Skips that confirmation. Still terminal only. |
| `-C`, `--repo <dir>` | The deployment directory (default `.`). |
| `--env <file>` | The deployment's env file (default `env/production.env`). |

- The link is a one-hour, single-use credential. Running the command again
  invalidates every earlier unused link, so only the newest one works.
- It prints only to a terminal. It checks that before it mints anything, so a
  pipe, a redirect or a CI step is refused and no live token is left behind.
- Without `--remove-mfa`, setting the password is all it does: the owner still
  needs their authenticator at the next login. With it, the owner's TOTP secret
  and recovery codes are deleted and every session is signed out. If the owner
  had no authenticator, nothing is removed and it says so.
- Every run is audited as an owner-recovery event with the mode
  (`password_only` or `password_and_mfa`). The audit row is written before the
  link is shown; if the write fails, the link is withheld and expires unused.
- It refuses when there is no owner yet (it points you at `vidra claim`) and
  when the owner's account is deactivated, because a new password would not
  restore access.
- A failure in the one-shot is relayed as one line, for example an unreachable
  database or an unset `PUBLIC_BASE_URL`. If the stack is not up, start with
  `vidra status`.

## Everyday Make equivalents

| Command | What it does |
|---|---|
| `make prod-config` | Render and validate the production compose chain; catches missing required secrets |
| `make deploy` | `deploy/deploy.sh` |
| `make rollback TAG=v0.4.0` | Rewrite the three tags, pull, restart, re-probe |
| `make backup` | `deploy/backup.sh` |
| `make restore DUMP=… CONFIRM=1` | **Destructive.** `deploy/restore.sh` |
| `make release VERSION=v0.5.0` | `deploy/release.sh` across all three repos |
| `make prod-logs` / `make prod-down` | Tail / stop the production stack |

All of them honour `PROD_ENV_FILE=env/staging.env`.

`make restore` asks first: like `make nuke` it wants `CONFIRM=1` or the word
typed at an interactive prompt, and refuses outright with no terminal. It then
invokes `deploy/restore.sh --yes`, so the confirmation happens exactly once, at
the layer the operator is typing at.
