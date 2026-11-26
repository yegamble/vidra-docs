---
title: Choose your setup path
description: Four ways to get a Vidra instance, and who each one is for.
---

# Choose your setup path

There are four ways in. They install the same software; they differ in how many
questions you answer and where you answer them.

| Path | Audience | Time | Ends with |
|---|---|---|---|
| [One-line install](../install/one-line-install.md) | Anyone with a fresh Ubuntu or Debian server | About 10 minutes | A configured `/opt/vidra`, ready for `vidra deploy` |
| [Web setup wizard](../install/wizard-setup.md) | The same, but you would rather answer questions in a browser | About 10 minutes | The same env file, written by the same engine |
| [Production deployment by hand](../install/production.md) | Operators with existing infrastructure, an external database, or their own TLS terminator | 30–60 minutes | A deployment you assembled step by step |
| [Development setup](../contribute/development.md) | Contributors and anyone evaluating the code | About 5 minutes | A local stack with hot reload and a demo account |

## One-line install — the default

```bash
curl -fsSL https://raw.githubusercontent.com/yegamble/vidra/main/install.sh | sh
```

Installs Docker if it is missing, unpacks a checksum-verified release bundle
into `/opt/vidra`, installs the `vidra` CLI, and runs the terminal interview. It
starts no containers and opens no ports; `vidra deploy` does that.

Take this path unless you have a specific reason not to.
See [Quickstart](./quickstart.md) for the whole sequence.

## Web setup wizard — same questions, in a browser

```bash
vidra setup --template env/production.env.example --web
```

Serves a nine-step wizard from the CLI process and prints a one-time link. It
binds to **loopback only** and there is no flag to change that: it writes the
env file and can run the deploy, and its one-time token is its only
authentication, over plain HTTP, before the TLS it is configuring exists. Reach
it from your own machine with `ssh -L 8321:127.0.0.1:8321 user@server`.

Both front ends share one engine, and a parity test pins them to the same
answers.

## Production deployment by hand — full control

Everything the installer automates, done deliberately: clone, `bootstrap.sh`,
fill in `env/production.env`, render the Caddyfile, render-check the compose
chain, run the two migrators, bring it up. This is the path to take when you
have an external Postgres, your own load balancer terminating TLS, or a
provisioning system that will not tolerate an interactive installer.

See [Production deployment](../install/production.md).

## Development setup — a local stack

```bash
git clone https://github.com/yegamble/vidra.git
cd vidra
make dev
```

Backend and search stack in containers, frontend on the host for hot module
reloading. `make seed` gives you a demo account. This is not a deployment path —
the local stack disables the global API rate limiter by default.

See [Development setup](../contribute/development.md).

## What you configure, whichever path you take

- **Domain and TLS** — `VIDRA_TLS_MODE` chooses the topology as well as the
  issuer: `acme`, `acme-staging` and `internal` run the managed Caddy;
  `external` leaves Caddy out entirely so your own proxy is the front door;
  `plain-http` is a deliberate no-TLS lab mode.
- **Media storage** — local volume or anything S3-compatible, with an optional
  dual-tier IPFS mirror. See [Storage backends](../install/storage-backends.md).
- **Optional components** — scanning (ClamAV), captions (Whisper), live media
  (RTMP), tracing (OpenTelemetry), IPFS. These are compose profiles, written to
  `VIDRA_COMPOSE_PROFILES`.
- **Secrets** — `JWT_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
  `MFA_KEY_KEK`, `SEARCH_INTERNAL_SECRET` and the SMTP and S3 credentials.
  `vidra setup` mints every one the template leaves blank.

Whatever you choose, the instance is not usable until you redeem the
owner-claim token. That step is in [Quickstart](./quickstart.md).
