---
title: One-line install
description: What install.sh does, what it refuses to do, and every flag it takes.
---

# One-line install

```bash
curl -fsSL https://raw.githubusercontent.com/yegamble/vidra/main/install.sh | sh
```

This is the recommended way to install Vidra on a fresh Ubuntu or Debian
server. Everything on this page is what that one line does; the manual
equivalent is [Production deployment](./production.md), and it stays supported.

## What it does, in order

1. **Detects the platform.** Linux amd64 and arm64. On macOS it prints the
   development quick start and stops.
2. **Installs `curl`, Docker Engine and the Compose v2 plugin** from **Docker's
   own apt repository**, when they are missing. The Compose it installs is 2.24
   or newer.
3. **Resolves vidra-core's latest release**, downloads that release's
   `vidra-bundle_<tag>.tar.gz`, verifies it against the release's `SHA256SUMS`,
   and unpacks it into `/opt/vidra`.
4. **Downloads and installs the `vidra` CLI** into `/usr/local/bin` the same
   way — **refusing to install either artefact on a checksum mismatch**.
5. **Hands the terminal to `vidra setup`**, the configuration interview.

Everything it would change sits behind **one** confirmation, read from
`/dev/tty` because under `curl … | sh` stdin is the script itself.

## The bundle, and the clone path

**There is no git in the default path.** The bundle is a complete deployment
tree: the compose files, the `deploy/` scripts, the env templates, and
`vidra-core/docker-compose.yml` plus the files it bind-mounts, at exactly the
paths a checkout would have them. Its root carries `vidra-bundle.manifest`,
which is how `deploy.sh` and `rollback.sh` recognise the tree — they skip the
component-checkout sync, which has nothing to sync, and read the expected schema
version from the manifest.

The clone path is still there and is reached two ways: `--git`, and a release
that carries no bundle asset (every release cut before the bundle existed, which
must keep installing). Both say so. That path clones the meta-repo and runs
`./bootstrap.sh` with `VIDRA_REF` set, so all three component checkouts are
pinned to the release. Take it deliberately if you want history, local patches,
or to follow `main`. `git` is installed only if that path is actually taken.

## Flags

| Flag | Environment variable | Default | What |
|---|---|---|---|
| `--yes` | `VIDRA_YES` | off | Skip the confirmation. **Required** where there is no terminal at all — cron, a Docker build, `</dev/null`. |
| `--ref vX.Y.Z` | `VIDRA_REF` | latest release | Pin a specific release. |
| `--dir <path>` | `VIDRA_HOME` | `/opt/vidra` | Where the deployment tree goes. |
| `--owner <name>` | `VIDRA_GH_OWNER` | `yegamble` | Install from a fork. |
| `--git` | `VIDRA_INSTALL_GIT` | off | Take the clone path instead of the bundle. |
| `--help` | — | — | Prints the lot. |

An installer that silently installs Docker onto an unattended host is the wrong
default, which is why `--yes` is opt-in rather than assumed.

## What it never does

- **Starts no containers.** `vidra deploy` does that, with the pre-deploy dump
  and the health gates.
- **Opens no ports.** Your firewall is yours.
- **Does not run `provision.sh`.** Swap, the service user and the backup timer
  are a separate, root-only decision.
- **Never writes or overwrites `env/production.env`.** `vidra setup` owns that
  file, refuses to rewrite an existing one without `--yes`, and the installer
  never passes `--yes` to it. Re-running an installer must not re-mint the
  key-encryption keys that seal data already in the database.

## It is safe to re-run

That is the design, not a tolerance. A second run:

- reports what it found and skipped;
- leaves an already-unpacked bundle tree exactly as it is — it is never
  re-extracted over, and your `env/production.env`, your `Caddyfile.local` and
  your edits are not in the tarball to be restored;
- fast-forwards a checkout **only while it is clean** — a dirty tree is left
  alone and warned about, never reset;
- leaves `/usr/local/bin/vidra` alone when it is already the same bytes.

If it stops early — a release with no CLI assets, a checksum mismatch, no
terminal for the interview — whatever it created stays where it is and the next
run continues from there.

## After it finishes

The interview has written `env/production.env` and `deploy/Caddyfile.local`.
Nothing is running. Continue with:

```bash
cd /opt/vidra
vidra deploy
```

Then claim the owner account — see [Quickstart, step 3](../start/quickstart.md).

## Host prep you still owe

`install.sh` deliberately leaves these to you. One idempotent script does all of
them:

```bash
sudo ./deploy/provision.sh          # asks once, then applies
sudo ./deploy/provision.sh --yes    # no prompt (cloud-init, CI, re-runs)
```

It does the swapfile **and** its `/etc/fstab` line, the `vidra` service user in
the `docker` group, `/opt/vidra` with the right owner, the Docker daemon log cap,
`unattended-upgrades`, and the backup timer — which it then *verifies* with
`systemctl is-enabled` / `is-active` and prints the next elapse for. Re-run it
after enabling a compose profile and it re-prints the firewall requirements for
the profiles you actually have on.

It **never** edits sshd and it opens **no** ports; both are checked and
reported. It never overwrites an `/etc/docker/daemon.json` that says something
else — it prints the keys to merge. Those refusals are the point: the first two
are how a host gets locked out or silently left open, and the third is a much
bigger outage than uncapped logs.

For a host that does not exist yet, `deploy/cloud-init.yaml.example` is the same
thing as provider user-data. It is deliberately pure ASCII — DigitalOcean
rejects non-ASCII user-data, silently — and CI asserts that it stays that way.

:::warning `git` in `/opt/vidra` must run as the `vidra` user
`install.sh` clones as root; `provision.sh` then creates the service user and
chowns the tree to it. After that, `git` as root refuses with *"detected dubious
ownership"* and does nothing. That refusal is safe on its own — what is not safe
is mixing it with file-level edits, because those still succeed, leaving the env
file naming a release the tree is not on.

```bash
cd /opt/vidra && sudo -u vidra ./deploy/pin-release.sh vX.Y.Z
```

That moves the checkout and sets the three image tags together. See
[Upgrading and rollback](./upgrading.md).
:::
