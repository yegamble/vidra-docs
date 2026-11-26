---
title: Migration overview
description: A one-way importer moves a PeerTube instance into Vidra. It is not a fork and not a client swap.
---

# Migrating from PeerTube to Vidra

Vidra is a **clean-room implementation, not a PeerTube fork**, and it is **not
API-compatible with PeerTube**. Your existing PeerTube clients, embeds and
plugins will not work against a Vidra instance.

What Vidra ships is **migration tooling**: a one-way importer that reads your
PeerTube instance's PostgreSQL database directly and carries the data across. It
is idempotent, resumable, and safe to run repeatedly against a still-live source
right up to cutover.

:::caution v0.7.7 changes the importer's media copy, and it is not yet qualified
v0.7.7 ships importer changes that v0.7.5 does not have: an optional server-side
copy of HLS media (`PEERTUBE_IMPORT_S3_COPY_*`), HLS trees copied concurrently,
captions imported concurrently, and PeerTube caption tracks reused without
fetching external subtitle URLs. They have not yet been qualified by a rehearsal
of the packaged release. If you plan a cutover on v0.7.7, rehearse the whole
import on an isolated host first, and keep the PeerTube source running as your
rollback.
:::

```mermaid
flowchart LR
    A["Plan and inventory"] --> B["Configure the source"]
    B --> C["Dry run"]
    C --> D["Import"]
    D --> E["Media"]
    E --> F["Validate"]
    F --> G["DNS cutover"]
    G --> H["Monitor"]
    D -.->|"repeat until cutover"| C
```

## Two ways to run it

| Path | Best for | Where the source connection lives |
|---|---|---|
| [**Admin API import**](./api-migration.md) | Most operators. A managed run you launch from the admin console and poll for progress. | Server config only — the browser never sends a DSN or a credential. |
| [**Command-line importer**](./manual-migration.md) | Anything the API cannot do: `--force` on an unverified schema, a run against a database the api cannot reach, or a source you want to drive from a laptop over a tunnel. | `--source-dsn` on the command line. |

Both drive the same importer. Everything in this section applies to both unless
it says otherwise.

## What it carries

| Data | Carried | Notes |
|---|---|---|
| Users and accounts | Yes | Username, email, role, verification state — **and the bcrypt password hash, verbatim**. Users keep their passwords. |
| Channels | Yes | Names, descriptions, support text |
| Videos | Yes | Metadata, privacy, tags, categories, languages, original publication date |
| Video renditions | Yes | The HLS quality ladder's rungs, in reference mode |
| Comments | Yes | Full thread trees, parent-child preserved |
| Playlists and items | Yes | Metadata and ordered items |
| Captions | Yes | With language metadata |
| Subscriptions | Yes | Channel follows |
| Chapters | Yes | |
| Ratings | Yes | Likes and dislikes |
| View totals | Yes, as a **delta** | The ledger remembers the source total it last applied and only adds the difference, so a re-run against an unchanged source adds nothing and views Vidra served between runs are never erased. The per-day rollup is deliberately left empty: the source has one lifetime number and no daily history, and inventing buckets would fabricate a shape of data that was never measured. |
| Category taxonomy | Yes | Including a `peertube-plugin-categories` custom taxonomy — see below |
| Avatars and banners | Yes | Fetched from a mounted source root, or over HTTP from the source instance |
| Video posters and storyboards | Yes | The same way |
| **Moderation state** | **No, deliberately** | Video blacklist, account and server blocklists, abuse reports |
| **Notification settings and watch history** | **No, deliberately** | |
| Original-file provenance (`videoSource`) | **No** | Simply unread today |
| Federation peers | Manual | ActivityPub followers need to re-follow after cutover |
| OAuth clients | Manual | Third-party apps must be re-registered |
| PeerTube plugins | **No** | Vidra has no plugin system that could run them |

:::tip Passwords come across
This is the opposite of what most migrations require. The importer carries the
source's bcrypt hash verbatim and Vidra verifies against it, so your users sign
in with the passwords they already have. There is no bulk password-reset email
to send.
:::

## It is idempotent, resumable, and re-runnable

Every import writes to a **durable ledger**, so a re-run skips rows already
imported rather than duplicating them. Three things follow from that, and they
shape the whole workflow:

1. **A failed run is resumed, not restarted.** Interruptions are cheap.
2. **A re-run backfills.** An instance whose catalogue is already in Vidra
   picks up data a newer importer release learned to carry, without
   re-importing anything from scratch. If your migrated instance shows a broken
   image on every card, re-run the importer — the poster pass repairs those rows
   in place.
3. **You can sync repeatedly against a live source.** The intended workflow is a
   scheduled run against a still-running PeerTube, right up to the cutover
   window, so the final sync is small.

For that last case there is a second, orthogonal switch: **`source_authoritative`**
(the `--source-authoritative` flag). It decides whether a re-run may **update**
rows the import already owns — a title edited, a password changed or a chapter
moved on the source. It never touches a row created on Vidra (those have no
ledger entry), never re-inserts, never rotates an actor keypair, never assigns a
view count, never overwrites a rendition row, and never re-downloads media.
It defaults to false: gap-filling, which is what an import has always done.

Do not confuse it with `conflict_policy` (`skip` | `rename` | `merge` | `fail`,
default `skip`), which resolves username, handle, email and slug **collisions at
insert time**.

## The version gate

The importer accepts a source `migrationVersion` in the **verified range
[700, 1000]** and refuses anything outside it:

```
source schema version 1040 is newer than the verified range [700, 1000]
— pass --force only after verifying compatibility
```

That refusal is a statement about what has been **verified**, not about what
happens to work. Overriding it is a human decision:

- On the **API path**, re-launch with `acknowledged_schema_version` set to the
  detected version. The server never sets that field for itself and has no
  default for it, and the run records what was signed off on.
- On the **CLI path**, `--force`. Its own help says *"HUMAN operators only;
  agents MUST NOT set this"*.

A source whose schema version cannot be read at all fails with
`undetectable_schema` and is **not acknowledgeable** — there is no version to
name. That one needs the CLI with `--force`.

What "verifying compatibility" can reasonably mean, given the importer only
reads: check that every column it references still exists on the source
(a removed or renamed column is the failure that would break the run loudly),
and check what the newer schema *added* that the importer does not read (the
quieter risk — the import does not fail, it silently carries less than you
assume). Neither check proves semantic equivalence.

## The category taxonomy

The importer carries each video's numeric `category` id, because Vidra's
built-in list uses PeerTube's ids on purpose. That only works while the source
runs the stock 1–18 list. An instance running **`peertube-plugin-categories`**
does not: it deletes the stock entries and defines its own at higher ids.

So the taxonomy comes across too, into an instance setting that **replaces** the
built-in list when set. Two rules govern a re-run:

- **A source without the plugin gets no override.** Absent, disabled or
  carrying no taxonomy all read the same way: Vidra's built-in list stands.
- **An operator's taxonomy is never clobbered.** The ledger records the exact
  value the import applied. A stored value that still equals it is the import's
  own and is updated when the source moves; anything else — an edit, a
  hand-configured taxonomy, a cleared key — is left exactly as it is and
  reported under `conflicts`.

## Next

1. **[Plan your migration](./planning.md)** — inventory the source, prepare Vidra.
2. **[Admin API import](./api-migration.md)** — the managed path.
3. **[Command-line importer](./manual-migration.md)** — every flag.
4. **[Media migration](./storage-migration.md)** — copy, reference, or neither.
5. **[Cutover and validation](./cutover.md)** — DNS, checks, rollback.
6. **[Troubleshooting](./troubleshooting.md)** — what actually goes wrong.
