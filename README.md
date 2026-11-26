# vidra-docs

Documentation for [Vidra](https://github.com/yegamble/vidra), built with
[Docusaurus](https://docusaurus.io/).

Published at **https://vidra.yosef.app/docs/**. The marketing Next.js app owns
the apex and rewrites `/docs/*` to this site, which is why `baseUrl` is `/docs/`
rather than `/`.

## Install

```bash
yarn
```

Node 22 or newer. This project uses Yarn (`yarn.lock`) — do not switch it to npm.

## Develop

```bash
yarn start        # dev server with hot reload
yarn typecheck    # tsc
yarn build        # production build into build/
yarn serve        # serve the built site
```

`onBrokenLinks` is `'throw'`, so `yarn build` is the link checker. A build that
passes has no broken internal links.

## Deploy

Cloudflare Pages, on push to `main`. `wrangler.toml` names the output directory;
the dashboard build settings must be:

| Setting | Value |
|---|---|
| Build command | `yarn install --frozen-lockfile && yarn build` |
| Build output directory | `build` |
| Node.js version | `22` |

To preview a production build locally:

```bash
yarn build && npx wrangler pages dev
```

There is no `yarn deploy` step and no `gh-pages` branch — the old GitHub Pages
flow is gone.

## Ground rules for content

**Every statement must be true of the product in
[`yegamble/vidra`](https://github.com/yegamble/vidra) today.** A missing page
beats a wrong page. If a claim cannot be verified against that repo, the
`vidra-core` source, or `deploy/README.md`, it does not go in.

Three facts this site has been wrong about before, and must not be again:

- Vidra is a **clean-room implementation**, not a PeerTube fork, and it is **not
  API-compatible with PeerTube**. Migration *from* PeerTube is supported tooling.
- Federation is **ActivityPub and ATProto**. Never ATProto-only; never drop
  ActivityPub.
- **IPFS** is the shipped distribution offload. In-player peer-to-peer is
  deferred — never write WebTorrent.

Voice and colour come from
[`vidra-branding`](https://github.com/yegamble/vidra-branding). Sentence case
throughout; no emoji anywhere, including admonition titles;
`.claude/skills/vidra-docs-design-theme/` is the local projection of that
palette.

## Structure

```
docs/          start · concepts · install · operate · migration · reference · contribute
sidebars.ts    the explicit sidebar — new pages must be added here
blog/
src/pages/     the landing page
src/css/       the theme
static/img/    logo, favicon, social card
notes/plans/   working notes, outside the docs plugin
```

## Known gaps

- **No wizard screenshots.** The ones this site used to carry were of an
  earlier, differently named product. Captures of the current nine-step
  `vidra setup --web` wizard are outstanding.
- **No generated REST API reference.** `reference/rest-api.md` points at
  `vidra-core/api/openapi.yaml`; rendering it here is a follow-up.
- **The favicon is generated from `vidra-icon.svg`** at 16, 32 and 48 px. Regenerate
  it with `rsvg-convert` plus `magick` if the mark changes.
