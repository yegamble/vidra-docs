---
title: Upgrading and rollback
description: Bump the tags, deploy, and know which rollback you need.
---

# Upgrading and rollback

An upgrade moves the tree to a release, pins the three image tags that release
names, and deploys. Images are built only from tags, so `VIDRA_CORE_TAG`,
`VIDRA_USER_TAG` and `VIDRA_SEARCH_TAG` in the env file name exactly what runs.
How you do the first two steps depends on what is in `/opt/vidra`:

```bash
test -f /opt/vidra/vidra-bundle.manifest && echo "bundle tree" || echo "git checkout"
```

`install.sh` unpacks a release bundle by default, so a host installed that way
is a **bundle tree**. A host installed with `--git`, or from before bundles
existed, is a **git checkout**. Run the upgrade commands as the user that owns
the tree: `deploy/provision.sh` makes that the `vidra` user.

The three tags are not always the same one. A release can re-release vidra-core
alone and keep the frontend and search at their earlier tags: v0.7.5 pairs
vidra-core v0.7.5 with vidra-user and vidra-search v0.7.3. The pairing for each
release is the checked-in record `releases/<tag>.json` in
[`yegamble/vidra`](https://github.com/yegamble/vidra/tree/main/releases), and
`deploy.sh` refuses a set of tags no record pairs unless you pass
`VIDRA_RELEASE_MAPPING=warn`.

## Upgrading from v0.7.5

v0.7.7 pairs vidra-core v0.7.7 and vidra-user v0.7.7 with **vidra-search
v0.7.3**: search was not re-released, and `releases/v0.7.7.json` records that
pairing. Read these seven points before you move a v0.7.5 host. Do point 3
first.

Go from v0.7.5 straight to v0.7.7. vidra-core v0.7.6 is withdrawn and marked
as a pre-release: its deployment bundle was built from an out-of-date tree, and
it has no vidra-user release and no release record, so neither the installer
nor `vidra update` offers it. Do not pin it by hand.

### 1. `vidra update` on v0.7.5 refuses this release, by design

The v0.7.5 `vidra update` checks that the release exists in all three
repositories. With search held at v0.7.3 it stops at that check, calls v0.7.7
"half cut" and tells you to publish the missing release. That is expected. It
refuses before it snapshots the env file, takes a dump or deploys, so nothing
has changed. Do not follow the "publish the missing release" advice, and do not
work around the refusal. Upgrade by hand instead:

- **Bundle tree** (`/opt/vidra/vidra-bundle.manifest` exists): the manual steps
  in [If the script is older than this release](#if-the-script-is-older-than-this-release)
  below, with `TAG=v0.7.7`. They read the pairing from the record, so step 4
  sets `VIDRA_CORE_TAG=v0.7.7`, `VIDRA_USER_TAG=v0.7.7` and
  `VIDRA_SEARCH_TAG=v0.7.3`.
- **Git checkout**: `sudo -u vidra ./deploy/pin-release.sh v0.7.7`, then
  `sudo -u vidra ./deploy/deploy.sh`. `vidra update` on a checkout moves the
  images but not the meta tree, so it would leave you on the old compose files
  and scripts. The v0.7.5 `pin-release.sh` writes **one** tag into all three
  keys, so after it runs, check the result and put search back if it moved:

  ```bash
  grep -E '^VIDRA_(CORE|USER|SEARCH)_TAG=' env/production.env
  # want: core v0.7.7, user v0.7.7, search v0.7.3
  ```

  Running `pin-release.sh v0.7.7` a second time uses the v0.7.7 copy of the
  script, which writes each key from the release record.

### 2. Replace the `vidra` CLI yourself

Upgrading the tree never replaces `/usr/local/bin/vidra`, so after the steps
above `vidra owner reset` and `vidra claim` still answer "unknown command". Re-run
the installer with the release and no setup interview:

```bash
curl -fsSL https://raw.githubusercontent.com/yegamble/vidra/main/install.sh \
  | sh -s -- --ref v0.7.7 --no-setup
```

It downloads the v0.7.7 CLI, verifies it against the release's `SHA256SUMS` and
installs it over `/usr/local/bin/vidra`. On a bundle tree that already exists it
leaves the tree and `env/production.env` exactly as they are, and prints a
warning that it did not upgrade the tree: expected, because you did that in
point 1. Add `--yes` if there is no terminal to confirm on.

### 3. Set up encrypted off-site backups before you upgrade

On v0.7.5, `backup.sh` reads `BACKUP_RCLONE_REMOTE`, `BACKUP_S3_URI` and
`HEALTHCHECKS_URL` only from the process environment, never from
`env/production.env`. A host that set them in the env file has been taking
local-only, unmonitored backups. From v0.7.7 `backup.sh` reads them from the env
file, so **the upgrade starts uploading** the dump and the config archive
(`JWT_SECRET`, every key-encryption key, the database and S3 passwords) to
whatever remote you configured, the next time the timer runs.

Before you upgrade, either set `BACKUP_AGE_RECIPIENTS` to an
[age](https://age-encryption.org) public key, or confirm your rclone remote is a
`crypt` remote. From v0.7.7, `backup.sh` refuses to upload the config archive
in plaintext unless `BACKUP_AGE_RECIPIENTS` is set, the remote is `type =
crypt`, or you set `BACKUP_OFFSITE_PLAINTEXT=true`. The dump still uploads, but
the run exits non-zero. Details and the v0.7.5 behaviour are in
[Backups](./production.md#backups). The backup script lives in the meta tree, so
it only changes when you move the tree in point 1.

### 4. Rolling back is per component

v0.7.5 is not uniform: it pairs vidra-core v0.7.5 with vidra-user and
vidra-search v0.7.3. The v0.7.7 `rollback.sh` reads that pairing from
`releases/v0.7.5.json` in your tree, so after point 1 the bare form sets all
three tags correctly and logs the pairing it used:

```bash
vidra rollback v0.7.5
# [rollback] releases/v0.7.5.json pairs core=v0.7.5 user=v0.7.3 search=v0.7.3
```

The `rollback.sh` in a tree older than v0.7.7 writes the bare tag into all three
keys. It then fails pulling a vidra-user v0.7.5 image that does not exist, while
the release you are leaving keeps serving. If your tree is older, or you want the
command to say exactly what it pins, name each component:

```bash
vidra rollback --core v0.7.5 --user v0.7.3 --search v0.7.3
```

Rollback changes the image tags and nothing in the database, so schema 151 stays
in place. A v0.7.5 application runs against it, which is what the one-release
compatibility policy in [Rollback](#rollback) promises. After a rollback:

- **Mail configuration saved in the admin panel is ignored.** v0.7.5 has no such
  panel, so outbound mail uses the `SMTP_*` values in the env file again. The
  saved configuration stays in the database and applies again when you return to
  v0.7.7.
- **The six runtime settings revert to their env values.** `channel_sync_interval_minutes`,
  `channel_sync_batch`, `channel_sync_cooldown_minutes`,
  `channel_sync_backoff_max_hours`, `live_recording_retention_hours` and
  `audit_log_retention_days` are new in v0.7.7; v0.7.5 reads
  `CHANNEL_SYNC_INTERVAL`, `CHANNEL_SYNC_BATCH`, `CHANNEL_SYNC_COOLDOWN`,
  `CHANNEL_SYNC_BACKOFF_MAX`, `LIVE_RECORDING_RETENTION` and `AUDIT_LOG_RETENTION`
  from the env file only.

### 5. The Content-Security-Policy is enforced

The frontend now enforces its policy; the one that ships with v0.7.5
(vidra-user v0.7.3) only reported violations. Custom
CSS or JavaScript that loads a third-party font, stylesheet, script or iframe is
blocked. To stop the blocking while you fix it, set `CSP_REPORT_ONLY=true` in
`env/production.env` and run `vidra deploy`, not `vidra restart`: `restart`
keeps the environment the container was created with. The full procedure is in
[Content-Security-Policy](./production.md#content-security-policy). It needs the
v0.7.7 compose file, which is another reason a checkout host must move its meta
tree in point 1.

### 6. Custom JavaScript and CSS are owner-only; mail settings need your password

Saving non-empty custom JavaScript or CSS needs the instance owner. Any other
admin gets `403 owner_only`; clearing the document stays open to every admin, so
an admin can still remove a script they did not approve. Saving the outbound-mail
configuration asks the admin for their own password (or a step-up token, for an
account with no password), even if they are already signed in.

### 7. Migration 150 to 151 is additive

The release runs migration 0151, which creates one table, `mail_config`, and
changes nothing in an existing table. `deploy.sh` takes its pre-deploy dump
first and runs the migration as its own step, as on every release.

## Upgrade a git checkout

```bash
cd /opt/vidra
sudo -u vidra ./deploy/pin-release.sh vX.Y.Z   # tree to vX.Y.Z, tags set from the release record
sudo -u vidra ./deploy/deploy.sh               # dump → pull → gated migrate → up → probe
```

`pin-release.sh` moves the checkout, takes a snapshot of the env file first, and
writes the three tags from the release record, so you do not edit them by hand.
It refuses to run as root. A checkout older than v0.6.5 does not have the
script yet; the one-time manual move is in
[`deploy/README.md`](https://github.com/yegamble/vidra/blob/main/deploy/README.md).

## Upgrade a bundle tree

**A bundle tree has no `git pull`, and bumping the tags alone is refused.** The
bundle's `vidra-bundle.manifest` names the release the compose files and the
expected schema version belong to. If `VIDRA_CORE_TAG` differs from it,
`deploy.sh` stops in its pre-flight, before the dump, with nothing changed. The
upgrade is to unpack the new release's bundle, then set the tags, then deploy.
`pin-release.sh` does the first two in one command. Run both commands as the
user that owns the tree, from `/opt/vidra`:

```bash
cd /opt/vidra
sudo -u vidra ./deploy/pin-release.sh vX.Y.Z   # pairing → download → verify → unpack → tags
sudo -u vidra ./deploy/deploy.sh               # or: vidra deploy
```

`pin-release.sh` never deploys: it ends by printing `next: ./deploy/deploy.sh`
and the running stack is untouched until you run that. What it checks, in this
order, with the tree and the env file unchanged if any check fails:

- **The pairing comes from a record.** It reads `releases/<tag>.json` for the
  core, user and search tags and prints which tag each key will get. With no
  record it refuses to guess, because a uniform guess for a core-only release
  names images that do not exist. Retry with network access, or state it:
  `./deploy/pin-release.sh vX.Y.Z --component-tag user=<tag> --component-tag search=<tag>`.
- **The download is verified before anything is unpacked.** It fetches
  `vidra-bundle_<core tag>.tar.gz` and `SHA256SUMS` from the vidra-core release
  over HTTPS and stops on a missing entry or a checksum mismatch.
- **An unsafe archive is refused.** It lists the members first and refuses an
  absolute or `..` path, a symlink, hardlink or device, an archive with no
  `vidra-bundle.manifest`, and one that ships its own `env/*.env` or
  `deploy/Caddyfile.local`.
- **The copy is staged.** The archive is unpacked into a scratch directory inside
  the tree and copied over only after every check passed, with the manifest
  last, so an interrupted copy leaves the old manifest in place.
- **Your secrets are safe.** The bundle contains no `env/` secrets and no
  `Caddyfile.local`, and the script snapshots the env file outside the tree
  before it writes the three tags.

It refuses to run as root, because files unpacked by root leave root-owned
scripts in a tree the deploy user owns. A release cut before bundles existed has
no bundle to download, so the script stops there. Every later `deploy.sh` run
depends on the manifest and the tags agreeing, which is why one command writes
both. `install.sh` re-run on a bundle tree leaves it alone and only warns when
the newest release differs from what is installed; it never upgrades one.

### If the script is older than this release

The bundle upgrade is new in `pin-release.sh`. A tree installed from a release
cut before it (v0.7.5 and earlier) still has the old script, and the old script
refuses a bundle tree with `is not a git checkout`. The first upgrade from such
a tree must use the manual steps below. They unpack the new bundle, which brings
the new `pin-release.sh` with it, so every upgrade after that is the two commands
above.

1. Read the pairing. The record is not always inside the bundle you are about
   to unpack, so read it from the repository:

   ```bash
   TAG=vX.Y.Z      # the release you are moving to
   curl -fsSL "https://raw.githubusercontent.com/yegamble/vidra/main/releases/$TAG.json" -o "/tmp/$TAG.json"
   python3 -c 'import json,sys; c=json.load(open(sys.argv[1]))["components"]; [print(k, c[k]["tag"]) for k in ("core","user","search")]' "/tmp/$TAG.json"
   ```

   Note the three tags. The bundle is a vidra-core asset and is named for the
   **core** tag.

2. Download that bundle with the release's `SHA256SUMS` and verify it.

   ```bash
   cd /opt/vidra
   CORE=vX.Y.Z     # the core tag from the record
   BASE="https://github.com/yegamble/vidra-core/releases/download/$CORE"
   curl -fsSLO "$BASE/vidra-bundle_$CORE.tar.gz"
   curl -fsSLO "$BASE/SHA256SUMS"
   awk -v want="vidra-bundle_$CORE.tar.gz" '$2 == want || $2 == "*" want' SHA256SUMS | sha256sum -c -
   ```

   Do not continue unless that prints `OK`.

3. Unpack it over the tree, as the tree's owner.

   ```bash
   sudo -u vidra tar -xzf "vidra-bundle_$CORE.tar.gz" -C /opt/vidra   # overwrites tracked files, keeps yours
   ```

   Run as root, `tar` keeps the archive's uid 0 on every file, which leaves
   root-owned scripts in a tree the deploy user owns.

4. Set the three tags in `env/production.env` to the ones from step 1:
   `VIDRA_CORE_TAG`, `VIDRA_USER_TAG` and `VIDRA_SEARCH_TAG`.

5. Deploy.

   ```bash
   sudo -u vidra ./deploy/deploy.sh               # or: vidra deploy
   ```

Do steps 3 and 4 together: until both are done, `deploy.sh` stops in its
pre-flight because the manifest and the tags disagree.

## `vidra update`

`vidra update` finds the newest release, pins it, runs `deploy.sh` and, in the
cases it can, puts the previous tags back if the health probes fail. `vidra update --check` prints the
current and latest release and changes nothing.

On a **bundle tree**, `vidra update` hands the whole job to
`deploy/pin-release.sh`, exactly as in
[Upgrade a bundle tree](#upgrade-a-bundle-tree). Without `--tag` it first asks
GitHub for the newest vidra-core release and prints which one it chose and from
which owner. It reads the owner from `VIDRA_IMAGE_OWNER` in your shell, not from
the env file, so on a fork you set it there or name the release with
`--tag vX.Y.Z`. A bundle already on the newest release is left alone, and a
bundle ahead of it (a prerelease) is refused rather than moved backwards. It
reads and writes nothing else before the script runs, and like the script it
does not deploy, so run `vidra deploy` next. `vidra update --check` prints the
bundle's release and the newest one and changes nothing. `--yes` and
`--no-rollback` are refused there because the script has no prompt or deploy to
apply them to. `vidra` v0.7.5 and earlier do **not** recognise a bundle tree:
`vidra update` there treats it like a checkout and rewrites all three tags in
the env file. If it then fails, it can print a `restore.sh` line naming the
newest dump already in `backups/`, which that run did not take and which may be
weeks old. Do not use it on a bundle tree until your installed `vidra` is
newer; see [Upgrading from v0.7.5](#upgrading-from-v075). Run `vidra update --help`
for the flags your installed version supports.

## Rollback

```bash
# App only, no schema change:
./deploy/rollback.sh v0.4.0        # or: vidra rollback v0.4.0

# Across an incompatible schema change:
./deploy/compose.sh stop api frontend
./deploy/restore.sh backups/pre-deploy-<ts>.dump.gz
./deploy/rollback.sh v0.4.0
```

`rollback.sh` rewrites the three tag values, pulls, restarts and re-probes. It
does **not** touch the database, and that is only safe because of the
one-release schema-compatibility policy: release N−1's code must run against
release N's schema. That policy is mechanically enforced by `migrate-lint.sh`
and the `schema-compat` workflow — see
[Production deployment](./production.md#schema-compatibility-is-enforced-not-just-documented).

A true schema rollback is "restore the pre-deploy dump", not "migrate down".
That is what the second form above does, and it is why `deploy.sh` refuses to
proceed when its pre-deploy dump fails.

:::warning There is no auto-rollback
Failed health probes leave the broken release running. `deploy.sh` reports it
and stops; deciding to roll back is yours.
:::

## The embedded-migrator tag floor

Both migration one-shots are the **service image itself**, running its compiled-in
`migrate up`. `deploy.sh` and `rollback.sh` carry a `MIN_EMBEDDED_MIGRATE_TAG`
constant and refuse a `VIDRA_CORE_TAG` or `VIDRA_SEARCH_TAG` below it.

The reason is a hang, not an error: an older image's `main()` **ignores the
`migrate up` argv and starts an API server**, so the one-shot never exits.
`deploy.sh` would hang mid-pipeline and `rollback.sh` inside `up -d`. A hang with
no message is worse than a refusal.

To run a component release older than the floor you must also check out the
meta-repo revision that shipped with it — the pre-embedded compose files drove a
separate migrator container with a bind-mounted `migrations/` directory.
`VIDRA_USER_TAG` is not gated: the frontend has no migrator.

Raise the floor, never lower it.

## Cutting a release

```bash
make release VERSION=v0.5.0                    # all three repos; prompts first
make release VERSION=v0.5.0 CONFIRM=1          # same, unattended
make release VERSION=v0.5.0 REPOS="vidra-core" # one repo only
./deploy/release.sh --yes v0.5.0               # the script directly
vidra release --yes v0.5.0                     # the CLI, which execs that script
```

Each component repo's `publish-container.yml` runs on `release: published` and
pushes `ghcr.io/<owner>/<repo>:<tag>` — so cutting the release **is** building
the image. `release.sh` creates the release in each repo, watches the resulting
workflow run to its conclusion, then verifies the image is really in GHCR. It
exits non-zero with a per-image summary if any repo fails, and it does **not**
deploy anything.

The meta-repo is tagged too — first, and without a release — because
vidra-core's `release-assets.yml` builds the deployment bundle by checking *this*
repo out at the same tag. Run `release.sh` from a clean `main`; it refuses to tag
a HEAD that is not already on `origin/main`.

Guards, all of which fire before the first release is created:

- the tag must match `^v[0-9]+\.[0-9]+\.[0-9]+$` — the leading `v` is what every
  image reference assumes;
- `gh` must be authenticated;
- the tag must not already exist in **any** target repo;
- HEAD must be an ancestor of `origin/main`, and an existing meta tag of that
  name must point at that very commit;
- **`vidra-user` needs the `NEXT_PUBLIC_API_BASE_URL` repository variable set**,
  or its workflow refuses to build and there is no published image for any tag:
  ```bash
  gh variable set NEXT_PUBLIC_API_BASE_URL -R yegamble/vidra-user -b https://your.origin
  ```

**Re-publishing an existing tag** — a build that failed on a transient registry
error — needs no new release. Each `publish-container.yml` takes a
`workflow_dispatch` with a required `tag` input and refuses a tag that does not
exist, so a typo can never publish the default branch:

```bash
gh workflow run publish-container.yml -R yegamble/vidra-search -f tag=v0.5.0
```

## Merge order, when the compose revision changes

The chain is `bootstrap.sh` → component checkouts → `docker-compose.yml`
`include:`s vidra-core's compose file. A host on a new compose revision runs
against whatever images the tags name, so component releases land **before** the
compose revision that requires them:

1. `vidra-core` — release the change.
2. `vidra-search` — same.
3. the meta-repo revision, with any floors raised to the tags from 1 and 2, then
   `VIDRA_*_TAG` bumped in the env file.
