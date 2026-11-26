---
title: Quickstart
description: Install Vidra on a fresh Ubuntu or Debian server in three steps.
---

# Quickstart

One path, no choices: a fresh Ubuntu or Debian server, the installer, the setup
interview, and the owner-claim token. Everything else is a decision you can make
later.

Before you start, read [Requirements and sizing](./requirements.md) — the floor
is 4 vCPU and 8 GB of RAM, and the reason is transcoding, not web serving.

:::danger Compose 2.24 or newer, in production
`docker-compose.prod.yml` uses the `!reset` / `!override` merge tags to close the
Postgres, Redis and search port publishes. On an older Compose those tags are
**silently ignored** and your database is published to the internet while the
deploy reports success. `deploy.sh`, `rollback.sh` and `restore.sh` each parse
`docker compose version --short` and refuse to run below 2.24. The installer
installs a current Compose for you; verify with `nmap` from another host anyway.
:::

:::note Hardware floor
Do not use a 2 GB droplet. ffmpeg runs inside the api container, so one
`TargetAll` job on a 1080p source is twelve full-source encode passes. Postgres,
api, frontend, search, Caddy and one transcode need roughly 4 GB before ClamAV.
:::

## Step 1 — run the installer

On the server, as a user who can `sudo`:

```bash
curl -fsSL https://raw.githubusercontent.com/yegamble/vidra/main/install.sh | sh
```

It detects the platform, installs Docker Engine and the Compose v2 plugin from
Docker's own apt repository if they are missing, downloads vidra-core's latest
release bundle, verifies it against the release's `SHA256SUMS`, unpacks it into
`/opt/vidra`, installs the checksum-verified `vidra` CLI into
`/usr/local/bin`, and then hands the terminal to `vidra setup`.

Everything it would change sits behind **one** confirmation, read from
`/dev/tty` because under `curl … | sh` stdin is the script itself. Pass `--yes`
where there is no terminal to ask on.

**You should now see** the installer's summary of what it found and what it
installed, followed immediately by the first question of the setup interview.
Nothing is running yet: the installer starts no containers and opens no ports.

## Step 2 — set up, prepare the host, deploy

The interview writes `env/production.env` (mode 0600) and renders
`deploy/Caddyfile.local` from the deployment template. It asks for your domain
and TLS mode, media storage, which optional components you want, and mints every
secret the template leaves blank.

```bash
vidra setup --template env/production.env.example --yes   # if you need to re-run it
vidra setup --template env/production.env.example --web   # same questions, in a browser
```

Re-running is safe. The file being written is always read back first and every
value it already sets is preserved; a secret is only ever replaced when
`--rotate` names it. In a terminal, re-running over an existing env file needs
`--yes` (without it, setup refuses and changes nothing); the browser form asks in
its Review step instead. The installer never passes `--yes`, so an existing env
file is never silently rewritten.

Then prepare the host. The installer does not do this for you, and it is the
step the first deploy assumes: swap, the `vidra` service user, ownership of
`/opt/vidra`, the Docker log cap, unattended security upgrades and the nightly
backup timer.

```bash
cd /opt/vidra
sudo ./deploy/provision.sh
```

It opens no ports and does not touch sshd; it prints what your cloud firewall
must allow. It is idempotent, so re-running it is safe. Details are in
[the one-line installer](../install/one-line-install.md#host-prep-you-still-owe).

**From here on, run `vidra` as the `vidra` user.** Provisioning hands
`/opt/vidra` to it, `env/production.env` is readable by it alone, and it is the
user in the `docker` group. Run as your own login, the commands below fail with
a permission error.

Then bring the stack up:

```bash
cd /opt/vidra
sudo -u vidra vidra deploy
```

**You should now see** `vidra deploy` walk its gated pipeline — pre-deploy dump,
pull, the two migrators, `up -d --no-build`, health probes — and finish with
`/readyz` answering 200. Confirm it yourself:

```bash
curl -fsS http://127.0.0.1:8080/readyz
```

## Step 3 — claim the owner account

**The first admin is claimed, not registered.** While the instance is unclaimed
— empty `users` table, unredeemed token — every signup path answers
`403 owner_claim_required`. The only way in is a one-time token the api mints at
boot and prints to its own log. `vidra claim` finds it for you.

In an SSH terminal on the server, from the deployment directory:

```bash
cd /opt/vidra
sudo -u vidra vidra claim
```

It prints one link, `https://<your domain>/setup/claim#token=<token>`. Open it
in your browser: the form is already filled in with the token, and the page
removes the token from the address bar. Choose your username, email and
password. `vidra claim` prints only to an interactive terminal (a pipe or a log
file never receives the token), and if it finds no token, the owner is probably
already claimed.

:::note `vidra claim` needs a newer CLI than v0.7.5
The command is merged but is not in v0.7.5 or earlier. It is available from the
release after v0.7.5. If `vidra claim` answers `unknown command`, use the log
fallback below, which works on every release.
:::

**Fallback: read the token from the api log.** Run this on the server, as the
`vidra` user, because `compose.sh` reads the `0600` env file that only that user
can open:

```bash
cd /opt/vidra
sudo -u vidra ./deploy/compose.sh logs api | grep -E 'FIRST-RUN SETUP REQUIRED|OWNER STILL UNCLAIMED'
```

A fresh instance logs `FIRST-RUN SETUP REQUIRED`; an instance that has users but
whose owner was never claimed logs `OWNER STILL UNCLAIMED`. Both carry the token.
Use `compose.sh`, never a bare `docker compose logs api` — on a deployment host
the bare form auto-loads `docker-compose.override.yml` and addresses a different
project than the deploy scripts do. **Take the newest line:** every api restart
mints a fresh token and invalidates the previous one, and that includes the link
`vidra claim` printed.

Redeem the token at `https://<your domain>/setup/claim` in the browser (paste it
into the form), or directly:

```bash
curl -X POST https://example.com/api/v1/setup/claim-owner \
  -H 'Content-Type: application/json' \
  -d '{"token":"<the token>","username":"...","email":"...","password":"..."}'
```

Only the token's hash is stored, so a lost token is re-minted by restarting the
api — never recovered.

**You should now see** your instance's home page at your domain, and be able to
sign in as the owner. Verify you actually got admin before you trust it:
`GET /api/v1/admin/system` with your access token must return 200, and `/admin`
in the UI must render.

## Next steps

- **Lock the box down.** [Production deployment](../install/production.md)
  covers the firewall, the swapfile, the backup timer and the `nmap` check that
  proves your database is not on the internet.
- **Decide your registration policy.** Closed registration is the right default
  for a private launch. Change it in **Admin → Configuration → General**; see
  [Moderation and instance settings](../operate/moderation.md).
- **Prove your backups work.** Run `sudo -u vidra ./deploy/backup.sh` once
  by hand, then restore it into a scratch stack, never the live one. See [Operator CLI](../operate/cli.md).
- **Coming from PeerTube?** [Migrate from PeerTube](../migration/overview.md).
- **Just want to develop against it?** [Development setup](../contribute/development.md).
