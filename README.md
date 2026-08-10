# Archive Defender

Reclaim your library. Defend every byte.

Archive Defender is a twin-stick arcade game about stale media, runaway duplicates, hostile
sessions, and the heroic maintenance process standing between them and total library failure. It
began as the hidden arcade inside [Plex Librarian](https://github.com/BrycePearce/plex-librarian)
and remains embeddable there from the same game source.

## Play

The standalone game is intended to run at
[brycepearce.github.io/archive-defender](https://brycepearce.github.io/archive-defender/).

Keyboard and mouse controls:

- Move with `WASD` or the arrow keys.
- Aim with the mouse and hold the primary button to fire.
- Dash with `Space`.
- Fire Deep Scan with the secondary mouse button.
- Reload with `R`; pause with `Escape`.

Touch controls are available on touch-capable devices.

## Development

Archive Defender uses Deno 2, React, and Vite.

```bash
deno task dev
deno task test
deno task build
deno task build:lib
deno task verify
```

The standalone site is written to `dist/` by `deno task build`. The reusable React library and its
type declarations are written to `package/` by `deno task build:lib` and export:

- `archive-defender` — the `ArcadeGame` component and public game types.
- `archive-defender/launch` — audio priming helpers for host applications.
- `archive-defender/style.css` — the game stylesheet.

The host may provide `onExit` and `exitLabel` to render its own exit behavior. Without `onExit`, the
standalone game omits the host-navigation button.

## Releasing

Archive Defender is published as `archive-defender`. Releases are deliberate: update the version in
`package.json`, merge the change, and publish a GitHub release whose tag exactly matches that
version (for example, package version `0.1.1` uses tag `v0.1.1`). The release workflow verifies the
game, builds both distributions, checks the tag, and publishes the public npm package.

Publishing uses npm trusted publishing for GitHub repository `BrycePearce/archive-defender` and
workflow `publish.yml`. GitHub's short-lived OIDC identity authorizes each release without a stored
npm token.

Plex Librarian should pin an exact package version. After a release is available, update its
frontend import to the new version, run the full Plex Librarian verification task, and commit its
updated `deno.lock`. This keeps game releases independent and prevents an unreviewed game update
from changing the main application.

## Persistence

Progress and audio preferences are stored in browser local storage. The original
`plex-librarian:arcade-save-v2` key is intentionally retained so an embedded upgrade does not
discard existing saves. Different web origins still receive separate browser storage.

## Assets and licensing

The source code is available under the [MIT License](LICENSE). Bundled music and major sound effects
are CC0; their creators and source pages are recorded in
[`src/game/assets/README.md`](src/game/assets/README.md).
