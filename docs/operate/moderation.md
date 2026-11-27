---
title: Moderation and instance settings
description: Reports, registration policy, and the runtime settings registry behind the admin console.
---

# Moderation and instance settings

## Moderation

| Tool | What it does |
|---|---|
| **Reports** | Viewers report content; staff are actually notified, rather than the report landing in a table nobody opens. |
| **Sensitive content** | A per-user policy for how sensitive content is handled, plus creator-applied content warnings. |
| **Registration approval** | The *Require approval for new accounts* setting files signups into an admin approval queue instead of creating accounts. |
| **Quarantine** | New uploads can be held until reviewed rather than published on transcode completion. |
| **Blocks** | Account-level and instance-level blocks. These are yours — they are not synchronised with federated peers. |
| **Audit envelope** | Job and admin actions carry an audited envelope with an allow-list of fields and a `sensitiveKeys` denylist, guarded by a static test. |

## Find an account

In v0.7.34 or later, open **Admin → Users**. Enter part of a username or email
address and choose **Search**. Select **Staff** to show administrators and moderators, or
**Deactivated** to show accounts that have been switched off and can be
reactivated. The number on each button counts every account matching the
search in that group. An inactive moderator can appear in both groups.
**All** also includes records of permanently deleted accounts.

Changing the group or search takes you to its first page. Use **Next** to
continue through the same results. You can bookmark the filtered list.

## Advertising on staff pages

From v0.7.35, Vidra's player skips video ad breaks in Admin and Moderation.
On a site that loads custom JavaScript, entering or leaving a staff area
loads a fresh document. This clears third-party listeners created on the
previous page. Site styling and permitted customization still load.

If your site installs display ads through its own JavaScript, check the
current path before starting the vendor loader, timers or observers. Exclude
`/admin`, `/moderation`, any `/mod` alias, and their child paths. This also
covers a staff member who opens a bookmarked queue directly.

## Registration policy is a policy, not a security control

Closed registration is still the right default for a private launch, but it is
no longer the thing standing between a bot and your admin account.

The first admin is **claimed, not registered**: while the instance has an empty
`users` table and an unredeemed token, every signup path answers
`403 owner_claim_required`, and the only way in is the one-time token the api
mints at boot. See [Quickstart, step 3](../start/quickstart.md).

Two consequences worth knowing:

- An instance that already has users and no outstanding token is *implicitly
  claimed* and never mints one — upgrading an existing install does not suddenly
  print a bootstrap credential.
- If users exist but the owner was never claimed, the api re-mints on **every**
  boot, so an unclaimed token sitting in an old log can never stay a live admin
  credential.

`OWNER_CLAIM_TOKEN` pins the mint to a fixed value for test harnesses.
`config.validate()` **refuses it in production**; it is not an operator knob.

Open the doors when you are ready, from the admin console and without a
restart: **Admin → Configuration → General**
(`/admin/config/general`), section **Sign-up & new users**. Turn on
*Allow new registrations*, and turn on *Require approval for new accounts* if you
want signups queued for review. Both are runtime settings
(`registration_enabled` and `registration_require_approval`), and the change
applies immediately.

`REGISTRATION_ENABLED` and `REGISTRATION_REQUIRE_APPROVAL` in
`env/production.env` are only the **defaults** the instance starts with, used
until the setting is first saved in the console. After that, the saved value
wins and editing the env file does nothing. A saved setting shows an
*Overridden* badge with its default and a *Reset to default* link; use that to
go back to the env value.

## A user is locked out and mail does not work

From v0.7.7, an admin can create a one-time password reset link for an ordinary
user and hand it over themselves. It is for the case where the user cannot use
the normal "forgot password" mail because the instance cannot send any.

1. Open **Admin → Users** and select the user.
2. Under *Password reset link*, choose **Create password reset link**.
3. Enter **your own** password to confirm it is you. The user's password is not
   needed, which is the point.
4. Copy the link from the dialog and send it to the user over a channel you
   trust. **It is shown once**: closing the dialog discards it.

What to know about the link:

- **It works once.** It is the ordinary password-reset token, so using it sets the
  new password and signs the user out of every session.
- **It expires after one hour.** Creating another link for the same user cancels
  the previous one, so only the newest works.
- **It is a credential.** Whoever holds it can set that account's password. Do
  not paste it into a public chat or a ticket.
- **Only ordinary, active accounts.** The owner and staff accounts (admins and
  moderators) cannot be given a link, even by the owner, and the control does not
  appear for them. A deactivated account is refused too: reactivate it first. The
  owner recovers with [`vidra owner reset`](#locked-out-of-the-owner-account).
- **It needs your password.** An admin account with no password gets a
  `409 password_not_set` and has to set one first.
- **It needs `PUBLIC_BASE_URL`.** The link is built on that origin; without it
  the request is refused rather than minting a link on a guessed host.
- **It is audited, and fails closed.** The action is recorded as
  `admin.user.password_reset_link` before the link is returned. If the audit write
  fails, no link is issued and the token just minted is withdrawn.

## Locked out of the owner account

The owner is the one account nobody above can reset, so there is a recovery that
needs shell access to the server instead of a login. Use the gentlest path that
works:

1. **Another admin can reach their mail.** Use the normal password reset, and
   for a lost authenticator have another admin open **Admin → Users**, select
   the owner and use **Remove second factor** under *Two-factor
   authentication* (it re-confirms that admin's own password and is audited).
   Neither needs the server.
2. **Nobody can receive mail, or the owner is the only admin.** Use
   `vidra owner reset`.

```bash
ssh -t you@your-server
cd /opt/vidra
vidra owner reset                 # lost password
vidra owner reset --remove-mfa    # lost password and authenticator
```

Use plain `vidra owner reset` when the owner has lost their password and mail
will not arrive. The owner still needs their authenticator at the next login.
Add `--remove-mfa` only when the authenticator is lost too: it deletes the
authenticator and recovery codes and signs the owner out everywhere, and the
command makes you type `remove` to confirm. After you log in, set up two-factor
again.

- **Run it in a terminal on the server.** Over SSH that means `ssh -t`; without
  a terminal on the command's output it refuses before it mints anything.
- **The link is a credential.** Whoever holds it can set the owner's password.
  It is single-use, expires after one hour, and is printed only to a terminal,
  never to a pipe or a log. A newer run invalidates the older link. Open it
  yourself and do not paste it into chat or a ticket.
- **It is audited.** Each run writes an audit event before the link is shown, so
  a recovery cannot happen without leaving a record.
- **It will not work on an unclaimed instance** (use [`vidra claim`](cli.md#vidra-claim))
  **or on a deactivated owner account.**

See [`vidra owner reset`](cli.md#vidra-owner-reset) for the flags.

## The instance settings registry

The admin console's configuration UI is not hand-written. It is **rendered from a
registry**: `internal/instancesettings` holds a typed, validated,
runtime-mutable set of settings, each carrying page and section metadata, and the
UI is generated from that metadata. Over a hundred settings are registered
today; the registry itself is the authoritative list.

Changing one takes effect **without a restart**. Runtime knobs reach workers
through provider-func closures, read at request or job time rather than baked in
at boot, and the server reloads its settings overlay when a value is written.

### The env-versus-database doctrine

| Lives in | What |
|---|---|
| **Environment only** | Secrets, and anything that is unsafe to change while the process is running — database and Redis DSNs, key-encryption keys, `PUBLIC_BASE_URL`, `TRANSCODING_PACKAGER`, the master federation switches |
| **The settings registry** | Anything an operator should be able to change from the admin console — instance identity, signup policy, upload policy, transcoding threads and concurrency, moderation defaults |

The rule is worth stating plainly, because it explains why a setting you want is
sometimes not in the UI: **effective capability is the setting AND the boot
configuration**. Turning a feature on in the admin console cannot conjure a
service that the compose profiles did not start.

Two runtime levers matter for anyone running near the hardware floor:

- `transcoding_threads` — set to vCPU − 1.
- `transcoding_concurrency` — leave at 1. Raising it multiplies both CPU **and**
  scratch disk, at roughly 4 × `UPLOAD_MAX_SIZE` per concurrent job.

See [Configuration](../reference/configuration.md) for how to read the current
registry, and [Requirements and sizing](../start/requirements.md) for the
numbers behind those two.
