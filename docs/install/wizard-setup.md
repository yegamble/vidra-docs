---
title: Web setup wizard
description: The same setup interview, asked in a browser, over loopback only.
---

# Web setup wizard

`vidra setup --web` asks exactly the same questions as the terminal interview,
in a browser instead. Both front ends share one engine (`internal/setup`), and a
parity test pins them to the same answers — so this is a different keyboard, not
a different product.

```bash
vidra setup --template env/production.env.example --web
```

It serves a nine-step wizard from the CLI process and prints a **one-time link**.

:::danger Loopback only, and there is no flag to change that
The wizard writes the env file and can run the deploy, and its one-time token is
its only authentication — over plain HTTP, before the TLS it is configuring
exists. It binds to loopback and cannot be told to do otherwise.

To drive it from your own machine, forward the port over SSH:

```bash
ssh -L 8321:127.0.0.1:8321 user@server
```

Then open the printed link on your side of the tunnel.
:::

It shuts itself down on Finish, on Ctrl-C, and after **30 minutes** with no
browser talking to it.

`--listen host:port` moves it to another loopback address if 8321 is taken.

## The nine steps

Welcome · System check · Question depth · Domain and TLS · Media storage ·
Optional features · Review · Install · Done.

Two of them are worth knowing about in advance.

**Question depth** decides how much you are asked. The wizard can run a short
path with sensible defaults or ask everything; either way the same engine writes
the same file format.

**Review** is where the in-place rewrite is confirmed. The terminal command has
`--yes` for that; in the wizard it is a checkbox on this step, where you can see
what it would change before you agree to it.

## What it writes

The same two files as the terminal interview:

- **`env/production.env`**, mode 0600, generated from the deployment template
  with comments and ordering preserved, and every secret the template leaves
  blank minted for you.
- **`deploy/Caddyfile.local`**, rendered from the `deploy/Caddyfile` template
  with your domain as the site address and your TLS mode as the issuer. The
  production compose file bind-mounts it, and `deploy.sh` refuses to start
  without it.

With `--tls-mode external` no Caddyfile is written at all — the managed Caddy is
left out of the compose profiles and an example config for your own proxy is
generated instead.

## Re-running is safe

The file being written is **always read back first** and every value it already
sets is preserved. A secret is only ever replaced when `--rotate` names it, and
rotating a `*_KEK` additionally needs `--yes-i-know`, because it orphans data
already sealed in the database.

Optional components (`--scan`, `--captions`, `--media`, `--otel`, `--ipfs`) are
compose profiles written to `VIDRA_COMPOSE_PROFILES`. Not passing one keeps
whatever the env file already selects, so a re-run about something else cannot
silently switch a component off; pass `--scan=false` to turn one off
deliberately.

## After the wizard

The wizard configures; it does not claim your account. On a fresh install every
signup path refuses until the one-time owner-claim token from the api's boot log
is redeemed at `/setup/claim`. That is
[Quickstart, step 3](../start/quickstart.md).

:::note No screenshots here yet
This page describes the wizard from its implementation rather than from
pictures. The screenshots this site used to carry were of an earlier, differently
named product and have been removed rather than left to mislead. Captures of the
current nine-step wizard are a tracked follow-up.
:::
